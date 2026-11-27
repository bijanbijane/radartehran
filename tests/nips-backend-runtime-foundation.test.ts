import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  NIPS_CROSS_CUTTING_PROFILE_DOMAINS,
  NIPS_DOMAIN_IDS,
  NIPS_DEFAULT_PUBLICATION_POLICY,
  NIPS_PROFILE_SCHEMA_VERSION,
  NipsProfileAssemblyError,
  assembleNipsNeighborhoodProfile,
  canonicalizeNipsValue,
  computeNipsProfileContentHash,
  createApprovedNipsPublicationRecord,
  evaluateNipsPublicationCandidate,
  getNipsCatalogMappedDomains,
  serializeNipsProfileForPublic,
  validateNipsGoldenReference,
  validateNipsNeighborhoodProfile,
  validateNipsPublicationPolicy,
  type NipsNeighborhoodProfile,
  type NipsProfileAssemblyInput,
} from '../server/modules/neighborhood-profile';

const goldenReference = JSON.parse(readFileSync(
  new URL('../docs/architecture/NIPS-GOLDEN-REFERENCE-1.0.0.json', import.meta.url),
  'utf8'
)) as unknown;

function buildAssemblyInput(): NipsProfileAssemblyInput {
  const now = '2026-11-26T12:00:00.000Z';
  const envelope = (domainId: string, state: 'READY' | 'UNAVAILABLE', data: unknown = {}) => ({
    domainId,
    state,
    updatedAt: now,
    metrics: [],
    data,
    readiness: {
      publishableMetricCount: 0,
      blockedMetricCount: 0,
      staleMetricCount: 0,
      unavailableMetricCount: 0,
      reasons: [],
    },
  });
  const identityData = {
    canonicalEntityId: 'irni:neighborhood:test-001',
    registryRevision: 7,
    entityType: 'URBAN_NEIGHBORHOOD',
    identityStatus: 'CONFIRMED_CANONICAL',
    officialName: 'محله آزمون',
    localizedNames: { fa: 'محله آزمون', en: 'Test Neighborhood' },
    verifiedAliases: [],
    parentEntities: [],
    legacyCrosswalks: [],
  };
  const domains: Record<string, unknown> = {};
  for (const domainId of NIPS_DOMAIN_IDS.filter((id) => id !== 'identity')) {
    const mandatory = domainId === 'geography' || domainId === 'evidence';
    const data = domainId === 'evidence'
      ? {
          sourceRegistryRevision: 1,
          evidenceRegistryRevision: '1',
          variableCatalogVersion: '2.0.0',
          methodologyCatalogVersion: '1.0.0',
          lineageGraphReference: null,
          sourceCoverage: [],
          unresolvedConflicts: 0,
        }
      : {};
    domains[domainId] = envelope(domainId, mandatory ? 'READY' : 'UNAVAILABLE', data);
  }

  return {
    profileId: 'nips:profile:test-001',
    profileVersion: 1,
    canonicalEntityId: identityData.canonicalEntityId,
    identity: envelope('identity', 'READY', identityData) as NipsProfileAssemblyInput['identity'],
    domains: domains as NipsProfileAssemblyInput['domains'],
    createdAt: now,
    assembledAt: now,
    assemblyBuildId: 'test-build-1',
    methodologyVersion: '1.0.0',
    publicationPolicyVersion: NIPS_DEFAULT_PUBLICATION_POLICY.version,
    sourceWatermarks: { irni: 'revision-7', catalog: '2.0.0' },
  };
}

test('NIPS Golden Reference contains all 12 categories and 120 non-real variable placeholders', () => {
  assert.deepEqual(validateNipsGoldenReference(goldenReference), []);
});

test('the twelve catalog categories map explicitly into the fourteen runtime domains', () => {
  const mapped = getNipsCatalogMappedDomains();
  assert.equal(mapped.length, 13);
  assert.ok(mapped.includes('identity'));
  assert.ok(mapped.includes('geography'));
  assert.deepEqual(NIPS_CROSS_CUTTING_PROFILE_DOMAINS, ['history']);
  assert.equal(NIPS_DOMAIN_IDS.length, 14);
});

test('canonical JSON uses sorted keys and rejects runtime-only values', () => {
  assert.equal(canonicalizeNipsValue({ b: 2, a: 1 }), canonicalizeNipsValue({ a: 1, b: 2 }));
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  assert.throws(() => canonicalizeNipsValue(cyclic), /NIPS_CANONICAL_JSON_CYCLE/);
  assert.throws(() => canonicalizeNipsValue([, 1]), /NIPS_CANONICAL_JSON_SPARSE_OR_ACCESSOR_ARRAY/);
  assert.throws(() => canonicalizeNipsValue(new Date()), /NIPS_CANONICAL_JSON_NON_PLAIN_OBJECT/);
});

test('snapshot assembly requires confirmed canonical identity and returns a reproducible SHA-256 hash', async () => {
  const input = buildAssemblyInput();
  const profile = await assembleNipsNeighborhoodProfile(input);
  assert.equal(profile.metadata.schemaVersion, NIPS_PROFILE_SCHEMA_VERSION);
  assert.equal(profile.metadata.publicationState, 'DRAFT');
  assert.match(profile.metadata.contentHash ?? '', /^[a-f0-9]{64}$/);
  assert.equal(await computeNipsProfileContentHash(profile), profile.metadata.contentHash);

  const changed = await assembleNipsNeighborhoodProfile({
    ...input,
    sourceWatermarks: { irni: 'revision-8', catalog: '2.0.0' },
  });
  assert.notEqual(changed.metadata.contentHash, profile.metadata.contentHash);
});

test('snapshot assembly refuses unresolved or mismatched neighborhood identity', async () => {
  const input = buildAssemblyInput();
  const identity = {
    ...input.identity,
    data: { ...input.identity.data, identityStatus: 'UNVERIFIED' },
  } as NipsProfileAssemblyInput['identity'];
  await assert.rejects(
    () => assembleNipsNeighborhoodProfile({ ...input, identity }),
    (error: unknown) => error instanceof NipsProfileAssemblyError &&
      error.code === 'NIPS_CANONICAL_IDENTITY_NOT_CONFIRMED'
  );
});

test('custom publication policy cannot remove identity, geography or evidence hard gates', async () => {
  const profile = await assembleNipsNeighborhoodProfile(buildAssemblyInput());
  const issues = validateNipsPublicationPolicy(profile, {
    ...NIPS_DEFAULT_PUBLICATION_POLICY,
    requiredDomains: [],
  });
  assert.ok(issues.some((issue) => issue.code === 'PUBLICATION_POLICY_VIOLATION'));
});

test('publication evaluates the canonical identity and deterministic snapshot hash before approval', async () => {
  const profile = await assembleNipsNeighborhoodProfile(buildAssemblyInput());
  const evaluation = await evaluateNipsPublicationCandidate(
    profile,
    'irni:neighborhood:test-001',
    NIPS_DEFAULT_PUBLICATION_POLICY
  );
  assert.equal(evaluation.approved, true);
  const record = await createApprovedNipsPublicationRecord({
    profile,
    snapshotId: 'snapshot-test-001',
    canonicalEntityId: 'irni:neighborhood:test-001',
    publicationId: 'publication-test-001',
    productKey: 'neighborhood-profile',
    audience: 'PUBLIC',
    decidedAt: '2026-11-26T12:05:00.000Z',
    actorReference: 'test:admin',
  });
  assert.equal(record.decision, 'APPROVED');
  assert.equal(record.status, 'ACTIVE');
});

test('public serializer suppresses metrics whose evidence is not redistributable', async () => {
  const profile = await assembleNipsNeighborhoodProfile(buildAssemblyInput());
  const restrictedMetric = {
    metricId: 'metric.restricted.test',
    value: 42,
    state: 'OBSERVED',
    unit: 'count',
    currency: null,
    semanticRole: 'TEST',
    period: { kind: 'SNAPSHOT', observedAt: '2026-11-26T12:00:00.000Z', periodStart: null, periodEnd: null, asOf: null },
    geography: {
      level: 'NEIGHBORHOOD',
      canonicalEntityId: 'irni:neighborhood:test-001',
      boundaryVersionId: null,
      boundarySchemeId: null,
      boundarySchemeVersion: null,
      assignmentMethod: 'DIRECT',
      precision: 'EXACT',
    },
    methodologyId: 'test-method',
    methodologyVersion: '1.0.0',
    provenance: {
      evidence: [{
        evidenceId: 'evidence-private-001',
        sourceId: 'private-source',
        sourceVersion: '1',
        evidenceHash: 'a'.repeat(64),
        evidenceReference: 'r2://private/source-record',
        permissionStatus: 'RESTRICTED',
        verifiedAt: '2026-11-26T12:00:00.000Z',
      }],
      canonicalObservationIds: ['observation-1'],
      sourceVariableMappingIds: ['mapping-1'],
      transformationIds: ['run-1'],
    },
    quality: {
      status: 'VERIFIED',
      confidence: 1,
      sampleSize: 1,
      coverageRatio: 1,
      freshnessStatus: 'CURRENT',
      limitations: [],
    },
    comparabilityKey: null,
    display: { labelKey: 'test.metric', format: 'NUMBER', precision: 0 },
  };
  const withMetric = {
    ...profile,
    domains: {
      ...profile.domains,
      demographics: {
        ...profile.domains.demographics,
        metrics: [restrictedMetric],
        readiness: {
          ...profile.domains.demographics.readiness,
          publishableMetricCount: 1,
        },
      },
    },
  } as unknown as NipsNeighborhoodProfile;
  const publicView = serializeNipsProfileForPublic(withMetric);
  const demographicMetric = publicView.domains.find((domain) => domain.domainId === 'demographics')?.metrics[0];
  assert.equal(demographicMetric?.state, 'SUPPRESSED');
  assert.equal(demographicMetric?.value, null);
  assert.equal(demographicMetric?.evidenceCount, 0);
  assert.equal('sourceId' in (demographicMetric ?? {}), false);
});


test('public serializer allow-lists nested fields and redacts free-form internal diagnostics', async () => {
  const profile = await assembleNipsNeighborhoodProfile(buildAssemblyInput());
  const publicMetric = {
    metricId: 'metric.public.test',
    value: 42,
    state: 'OBSERVED',
    unit: 'count',
    currency: null,
    semanticRole: 'TEST',
    period: {
      kind: 'SNAPSHOT',
      observedAt: '2026-11-26T12:00:00.000Z',
      periodStart: null,
      periodEnd: null,
      asOf: null,
      privatePayload: 'private-sentinel-period',
    },
    geography: {
      level: 'NEIGHBORHOOD',
      canonicalEntityId: 'irni:neighborhood:test-001',
      boundaryVersionId: null,
      boundarySchemeId: null,
      boundarySchemeVersion: null,
      assignmentMethod: 'DIRECT',
      precision: 'EXACT',
      privatePayload: 'private-sentinel-geography',
    },
    methodologyId: 'test-method',
    methodologyVersion: '1.0.0',
    provenance: {
      evidence: [{
        evidenceId: 'evidence-public-001',
        sourceId: 'source-public-001',
        sourceVersion: '1',
        evidenceHash: 'c'.repeat(64),
        evidenceReference: 'r2://evidence/public-001',
        permissionStatus: 'DERIVED_ONLY',
        verifiedAt: '2026-11-26T12:00:00.000Z',
      }],
      canonicalObservationIds: ['observation-public-001'],
      sourceVariableMappingIds: ['mapping-public-001'],
      transformationIds: ['run-public-001'],
    },
    quality: {
      status: 'VERIFIED',
      confidence: 1,
      sampleSize: 1,
      coverageRatio: 1,
      freshnessStatus: 'CURRENT',
      limitations: ['private-sentinel-quality'],
      privatePayload: 'private-sentinel-quality-object',
    },
    comparabilityKey: null,
    display: {
      labelKey: 'test.metric',
      format: 'NUMBER',
      precision: 0,
      privatePayload: 'private-sentinel-display',
    },
  };
  const underReviewMetric = {
    ...publicMetric,
    metricId: 'metric.under-review.test',
    value: 987654,
    state: 'UNDER_REVIEW',
    quality: { ...publicMetric.quality, status: 'UNDER_REVIEW' },
  };
  const contaminatedProfile = {
    ...profile,
    identity: {
      ...profile.identity,
      data: {
        ...profile.identity.data,
        localizedNames: {
          ...profile.identity.data.localizedNames,
          'private-sentinel-locale': 'private-sentinel-locale-value',
        },
        parentEntities: [{
          canonicalEntityId: 'irni:city:test-001',
          level: 'CITY',
          name: 'Test City',
          privatePayload: 'private-sentinel-parent',
        }],
      },
      readiness: {
        ...profile.identity.readiness,
        reasons: ['private-sentinel-identity-reason'],
      },
    },
    domains: {
      ...profile.domains,
      demographics: {
        ...profile.domains.demographics,
        metrics: [publicMetric, underReviewMetric],
        readiness: {
          ...profile.domains.demographics.readiness,
          publishableMetricCount: 1,
          blockedMetricCount: 1,
          reasons: ['private-sentinel-readiness'],
        },
      },
    },
    quality: {
      ...profile.quality,
      publishableMetricCount: 1,
      overallReasons: ['private-sentinel-overall'],
    },
  } as unknown as NipsNeighborhoodProfile;

  const publicView = serializeNipsProfileForPublic(contaminatedProfile);
  const serialized = JSON.stringify(publicView);
  assert.equal(serialized.includes('private-sentinel'), false);

  const metric = publicView.domains.find((domain) => domain.domainId === 'demographics')?.metrics[0];
  assert.deepEqual(metric?.period, {
    kind: 'SNAPSHOT',
    observedAt: '2026-11-26T12:00:00.000Z',
    periodStart: null,
    periodEnd: null,
    asOf: null,
  });
  assert.deepEqual(metric?.quality.limitations, ['Some quality details are withheld.']);
  assert.deepEqual(
    publicView.domains.find((domain) => domain.domainId === 'demographics')?.readiness.reasons,
    ['Some readiness details are withheld.']
  );
  assert.deepEqual(publicView.quality.overallReasons, ['Some readiness details are withheld.']);

  const reviewMetric = publicView.domains
    .find((domain) => domain.domainId === 'demographics')?.metrics
    .find((candidate) => candidate.metricId === 'metric.under-review.test');
  assert.equal(reviewMetric?.state, 'SUPPRESSED');
  assert.equal(reviewMetric?.value, null);
  assert.equal(reviewMetric?.evidenceCount, 0);
  assert.equal(JSON.stringify(publicView).includes('987654'), false);
  assert.equal(publicView.quality.suppressedMetricCount, 1);
});


test('profile validation rejects NaN and Infinity in quality ratios', async () => {
  const profile = await assembleNipsNeighborhoodProfile(buildAssemblyInput());
  const invalidMetric = {
    metricId: 'metric.quality.non-finite',
    value: 1,
    state: 'ESTIMATED',
    unit: 'count',
    currency: null,
    semanticRole: 'TEST',
    period: { kind: 'SNAPSHOT', observedAt: '2026-11-26T12:00:00.000Z', periodStart: null, periodEnd: null, asOf: null },
    geography: {
      level: 'NEIGHBORHOOD',
      canonicalEntityId: 'irni:neighborhood:test-001',
      boundaryVersionId: null,
      boundarySchemeId: null,
      boundarySchemeVersion: null,
      assignmentMethod: 'DIRECT',
      precision: 'EXACT',
    },
    methodologyId: 'test-method',
    methodologyVersion: '1.0.0',
    provenance: {
      evidence: [{
        evidenceId: 'evidence-quality-001',
        sourceId: 'source-quality-001',
        sourceVersion: '1',
        evidenceHash: 'b'.repeat(64),
        evidenceReference: 'r2://evidence/quality-001',
        permissionStatus: 'DERIVED_ONLY',
        verifiedAt: '2026-11-26T12:00:00.000Z',
      }],
      canonicalObservationIds: ['observation-quality-001'],
      sourceVariableMappingIds: ['mapping-quality-001'],
      transformationIds: ['run-quality-001'],
    },
    quality: {
      status: 'ESTIMATED',
      confidence: Number.NaN,
      sampleSize: 1,
      coverageRatio: Number.POSITIVE_INFINITY,
      freshnessStatus: 'CURRENT',
      limitations: [],
    },
    comparabilityKey: null,
    display: { labelKey: 'test.metric', format: 'NUMBER', precision: 0 },
  };
  const demographics = {
    ...profile.domains.demographics,
    metrics: [invalidMetric],
    readiness: { ...profile.domains.demographics.readiness, publishableMetricCount: 1 },
  };
  const invalidProfile = {
    ...profile,
    domains: { ...profile.domains, demographics },
    quality: { ...profile.quality, publishableMetricCount: 1 },
  } as unknown as NipsNeighborhoodProfile;

  const issues = validateNipsNeighborhoodProfile(invalidProfile);
  assert.ok(issues.some((issue) => issue.code === 'INVALID_METRIC_QUALITY'));
});
