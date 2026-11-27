import assert from 'node:assert/strict';
import test from 'node:test';
import { NIPS_DOMAIN_CATALOG, isNipsDomainId } from '../server/modules/neighborhood-profile/catalog';
import { NIPS_DOMAIN_IDS, type NipsNeighborhoodProfile } from '../server/modules/neighborhood-profile/types';
import { validateNipsNeighborhoodProfile } from '../server/modules/neighborhood-profile/validation';

test('NIPS catalog declares exactly fourteen unique profile domains', () => {
  assert.equal(NIPS_DOMAIN_IDS.length, 14);
  assert.equal(NIPS_DOMAIN_CATALOG.length, 14);
  assert.equal(new Set(NIPS_DOMAIN_CATALOG.map((item) => item.id)).size, 14);
  for (const id of NIPS_DOMAIN_IDS) assert.equal(isNipsDomainId(id), true);
});

test('unknown domain identifiers are rejected', () => {
  assert.equal(isNipsDomainId('market'), false);
  assert.equal(isNipsDomainId('identity'), true);
});

test('profile validator rejects an incomplete structure and malformed metadata', () => {
  const profile = {
    metadata: { profileId: '', schemaVersion: '1.0.0', profileVersion: 0, publicationState: 'PUBLISHED',
      createdAt: 'not-a-date', assembledAt: 'not-a-date', publishedAt: null, assemblyBuildId: '',
      methodologyVersion: '', publicationPolicyVersion: '', sourceWatermarks: {}, contentHash: null },
    identity: { domainId: 'identity', state: 'READY', updatedAt: null, metrics: [], data: {}, readiness: {
      publishableMetricCount: 1, blockedMetricCount: 0, staleMetricCount: 0, unavailableMetricCount: 0, reasons: [] } },
    domains: {},
    quality: { domainCount: 1, readyDomainCount: 1, partialDomainCount: 0, blockedDomainCount: 0,
      staleDomainCount: 0, publishableMetricCount: 1, blockedMetricCount: 0, unavailableMetricCount: 0, overallReasons: [] },
  } as unknown as NipsNeighborhoodProfile;
  const issues = validateNipsNeighborhoodProfile(profile);
  const codes = new Set(issues.map((issue) => issue.code));
  assert.ok(codes.has('INVALID_PROFILE_ID'));
  assert.ok(codes.has('INVALID_PROFILE_VERSION'));
  assert.ok(codes.has('INVALID_TIMESTAMP'));
  assert.ok(codes.has('INVALID_DOMAIN_SET'));
  assert.ok(codes.has('INVALID_QUALITY_SUMMARY'));
});

test('a published profile cannot contain blocked or non-ready domains', () => {
  const envelope = (domainId: string, state: string) => ({
    domainId, state, updatedAt: null, metrics: [], data: {},
    readiness: { publishableMetricCount: 1, blockedMetricCount: 0, staleMetricCount: 0, unavailableMetricCount: 0, reasons: [] },
  });
  const domains: Record<string, unknown> = {};
  for (const id of NIPS_DOMAIN_IDS.filter((id) => id !== 'identity')) domains[id] = envelope(id, 'READY');
  domains.geography = envelope('geography', 'BLOCKED');
  const profile = {
    metadata: { profileId: 'nips:neighborhood:test', schemaVersion: '1.0.0', profileVersion: 1, publicationState: 'PUBLISHED',
      createdAt: '2026-11-26T00:00:00Z', assembledAt: '2026-11-26T00:00:00Z', publishedAt: null, assemblyBuildId: 'test',
      methodologyVersion: '1', publicationPolicyVersion: '1', sourceWatermarks: {}, contentHash: null },
    identity: envelope('identity', 'READY'), domains,
    quality: { domainCount: 14, readyDomainCount: 14, partialDomainCount: 0, blockedDomainCount: 0,
      staleDomainCount: 0, publishableMetricCount: 14, blockedMetricCount: 0, unavailableMetricCount: 0, overallReasons: [] },
  } as unknown as NipsNeighborhoodProfile;
  assert.ok(validateNipsNeighborhoodProfile(profile).some((issue) => issue.code === 'INVALID_QUALITY_SUMMARY'));
});

test('domain envelopes must identify their own domain and published snapshots need a publication timestamp', () => {
  const envelope = (domainId: string) => ({
    domainId, state: 'READY', updatedAt: null, metrics: [], data: {},
    readiness: { publishableMetricCount: 1, blockedMetricCount: 0, staleMetricCount: 0, unavailableMetricCount: 0, reasons: [] },
  });
  const domains: Record<string, unknown> = {};
  for (const id of NIPS_DOMAIN_IDS.filter((id) => id !== 'identity')) domains[id] = envelope(id);
  domains.geography = envelope('mobility');
  const profile = {
    metadata: { profileId: 'nips:neighborhood:test', schemaVersion: '1.0.0', profileVersion: 1, publicationState: 'PUBLISHED',
      createdAt: '2026-11-26T00:00:00Z', assembledAt: '2026-11-26T00:00:00Z', publishedAt: null, assemblyBuildId: 'test',
      methodologyVersion: '1', publicationPolicyVersion: '1', sourceWatermarks: {}, contentHash: null },
    identity: envelope('identity'), domains,
    quality: { domainCount: 14, readyDomainCount: 14, partialDomainCount: 0, blockedDomainCount: 0,
      staleDomainCount: 0, publishableMetricCount: 14, blockedMetricCount: 0, unavailableMetricCount: 0, overallReasons: [] },
  } as unknown as NipsNeighborhoodProfile;
  const codes = new Set(validateNipsNeighborhoodProfile(profile).map((issue) => issue.code));
  assert.ok(codes.has('INVALID_DOMAIN_SET'));
  assert.ok(codes.has('INVALID_QUALITY_SUMMARY'));
});

test('publication policy allows optional domains to be unavailable while enforcing mandatory identity domains', () => {
  const envelope = (domainId: string, state: string, metrics: unknown[] = []) => ({
    domainId, state, updatedAt: null, metrics, data: {},
    readiness: { publishableMetricCount: metrics.length, blockedMetricCount: 0, staleMetricCount: 0, unavailableMetricCount: 0, reasons: [] },
  });
  const domains: Record<string, unknown> = {};
  for (const id of NIPS_DOMAIN_IDS.filter((id) => id !== 'identity')) {
    domains[id] = envelope(id, ['geography','evidence'].includes(id) ? 'READY' : 'UNAVAILABLE');
  }
  const profile = {
    metadata: { profileId: 'nips:neighborhood:test', schemaVersion: '1.0.0', profileVersion: 1, publicationState: 'PUBLISHED',
      createdAt: '2026-11-26T00:00:00Z', assembledAt: '2026-11-26T00:00:00Z', publishedAt: '2026-11-26T00:00:00Z', assemblyBuildId: 'test',
      methodologyVersion: '1', publicationPolicyVersion: '1.0.0', sourceWatermarks: {}, contentHash: null },
    identity: {
      ...envelope('identity', 'READY'),
      data: {
        canonicalEntityId: 'irni:neighborhood:test',
        registryRevision: 1,
        identityStatus: 'CONFIRMED_CANONICAL',
      },
    },
    domains,
    quality: { domainCount: 14, readyDomainCount: 3, partialDomainCount: 0, blockedDomainCount: 0,
      staleDomainCount: 0, publishableMetricCount: 0, blockedMetricCount: 0, unavailableMetricCount: 0, overallReasons: [] },
  } as unknown as NipsNeighborhoodProfile;
  const codes = new Set(validateNipsNeighborhoodProfile(profile).map((issue) => issue.code));
  assert.equal(codes.has('PUBLICATION_POLICY_VIOLATION'), false);
  assert.equal(codes.has('INVALID_QUALITY_SUMMARY'), false);
});

test('metric values reject non-JSON runtime values and non-finite numbers', () => {
  const envelope = (domainId: string, state: string, metrics: unknown[] = []) => ({
    domainId, state, updatedAt: null, metrics, data: {},
    readiness: { publishableMetricCount: metrics.length, blockedMetricCount: 0, staleMetricCount: 0, unavailableMetricCount: 0, reasons: [] },
  });
  const invalidMetric = (value: unknown) => ({
    metricId: 'test.metric', value, state: 'ESTIMATED', unit: null, currency: null, semanticRole: 'TEST',
    period: { kind: 'SNAPSHOT', observedAt: '2026-11-26T00:00:00Z', periodStart: null, periodEnd: null, asOf: null },
    geography: { level: 'NEIGHBORHOOD', canonicalEntityId: 'irni:hood:test', boundaryVersionId: null, boundarySchemeId: null,
      boundarySchemeVersion: null, assignmentMethod: 'UNKNOWN', precision: 'UNKNOWN' },
    methodologyId: 'test-method', methodologyVersion: '1',
    provenance: { evidence: [{ evidenceId: 'e1', sourceId: 's1', sourceVersion: '1', evidenceHash: 'a'.repeat(64),
      evidenceReference: 'r2://evidence/e1', permissionStatus: 'DERIVED_ONLY', verifiedAt: '2026-11-26T00:00:00Z' }],
      canonicalObservationIds: ['o1'], sourceVariableMappingIds: ['m1'], transformationIds: ['t1'] },
    quality: { status: 'ESTIMATED', confidence: 0.8, sampleSize: 1, coverageRatio: 1, freshnessStatus: 'CURRENT', limitations: [] },
    comparabilityKey: null, display: { labelKey: 'test.metric', format: 'NUMBER', precision: 2 },
  });
  const build = (metric: unknown) => {
    const domains: Record<string, unknown> = {};
    for (const id of NIPS_DOMAIN_IDS.filter((id) => id !== 'identity')) domains[id] = envelope(id,
      ['geography','evidence'].includes(id) ? 'READY' : id === 'demographics' ? 'PARTIAL' : 'UNAVAILABLE',
      id === 'demographics' ? [metric] : []);
    return {
      metadata: { profileId: 'nips:neighborhood:test', schemaVersion: '1.0.0', profileVersion: 1, publicationState: 'PUBLISHED',
        createdAt: '2026-11-26T00:00:00Z', assembledAt: '2026-11-26T00:00:00Z', publishedAt: '2026-11-26T00:00:00Z',
        assemblyBuildId: 'test', methodologyVersion: '1', publicationPolicyVersion: '1.0.0', sourceWatermarks: {}, contentHash: null },
      identity: envelope('identity', 'READY'), domains,
      quality: { domainCount: 14, readyDomainCount: 3, partialDomainCount: 1, blockedDomainCount: 0,
        staleDomainCount: 0, publishableMetricCount: 1, blockedMetricCount: 0, unavailableMetricCount: 0, overallReasons: [] },
    } as unknown as NipsNeighborhoodProfile;
  };
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, new Date('2026-01-01T00:00:00Z'), undefined, () => 'not-json']) {
    assert.ok(validateNipsNeighborhoodProfile(build(invalidMetric(value))).some((issue) => issue.code === 'INVALID_JSON_VALUE'));
  }
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  assert.ok(validateNipsNeighborhoodProfile(build(invalidMetric(cyclic))).some((issue) => issue.code === 'INVALID_JSON_VALUE'));
});
