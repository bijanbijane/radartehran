import type {
  NipsDomainId,
  NipsMetric,
  NipsMetricState,
  NipsNeighborhoodProfile,
  NipsProfileQuality,
} from './types';
import type {
  NipsProfilePublicationRecord,
  NipsPublicationAudience,
} from './publication';
import type { NipsPublicationPolicy } from './validation';
import { evaluateNipsPublicationCandidate } from './publication';
import { NIPS_CATALOG_VERSION } from './standard';

export interface NipsPublicationScope {
  readonly canonicalEntityId: string;
  readonly productKey: string;
  readonly audience: NipsPublicationAudience;
}

export interface NipsProfileActivationCommand {
  readonly publication: Extract<NipsProfilePublicationRecord, { decision: 'APPROVED' }>;
  /** Compare-and-swap token; null means no active publication is expected. */
  readonly expectedActivePublicationId: string | null;
}

/**
 * Persistence port only. A production adapter must be implemented against the
 * database that owns shared NIPS records; USER_DB and RESEARCH_DB are not
 * implicit substitutes.
 */
export interface NipsProfileRepository {
  findSnapshotById(snapshotId: string): Promise<NipsNeighborhoodProfile | null>;
  findActivePublication(scope: NipsPublicationScope): Promise<NipsProfilePublicationRecord | null>;
  saveImmutableSnapshot(snapshot: NipsNeighborhoodProfile): Promise<void>;
  /**
   * Must atomically write the approved publication, supersede the previous
   * active decision, and replace the active pointer in one transaction.
   * Reject stale expectedActivePublicationId values (compare-and-swap).
   */
  activatePublication(command: NipsProfileActivationCommand): Promise<void>;
}

export interface NipsPublicMetric {
  readonly metricId: string;
  readonly value: NipsMetric['value'] | null;
  readonly state: NipsMetricState;
  readonly unit: string | null;
  readonly currency: string | null;
  readonly semanticRole: string;
  readonly period: NipsMetric['period'];
  readonly geography: NipsMetric['geography'];
  readonly methodologyId: string;
  readonly methodologyVersion: string;
  readonly quality: NipsMetric['quality'];
  readonly comparabilityKey: string | null;
  readonly display: NipsMetric['display'];
  readonly evidenceCount: number;
}

export interface NipsPublicDomain {
  readonly domainId: NipsDomainId;
  readonly state: string;
  readonly updatedAt: string | null;
  readonly metrics: readonly NipsPublicMetric[];
  readonly readiness: {
    readonly publishableMetricCount: number;
    readonly blockedMetricCount: number;
    readonly staleMetricCount: number;
    readonly unavailableMetricCount: number;
    readonly reasons: readonly string[];
  };
}

export interface NipsPublicProfileView {
  readonly standardId: 'NIPS-1.0.0';
  readonly catalogVersion: string;
  readonly profileId: string;
  readonly profileVersion: number;
  readonly canonicalEntityId: string;
  readonly contentHash: string;
  readonly identity: {
    readonly registryRevision: number;
    readonly identityStatus: 'CONFIRMED_CANONICAL';
    readonly officialName: string;
    readonly localizedNames: Readonly<Record<string, string>>;
    readonly parentEntities: NipsNeighborhoodProfile['identity']['data']['parentEntities'];
  };
  readonly domains: readonly NipsPublicDomain[];
  readonly quality: NipsProfileQuality & { readonly suppressedMetricCount: number };
}

function isPublicEvidencePermission(permission: string): boolean {
  return permission === 'PUBLIC_REDISTRIBUTION' || permission === 'DERIVED_ONLY';
}

function isNonValueState(state: NipsMetricState): boolean {
  return state === 'MISSING' || state === 'UNAVAILABLE' || state === 'NOT_APPLICABLE';
}

function serializePublicMetric(metric: NipsMetric): NipsPublicMetric {
  const permissions = metric.provenance.evidence.map((item) => item.permissionStatus);
  const evidenceAllowed = permissions.every(isPublicEvidencePermission);
  const evidenceRequired = !isNonValueState(metric.state);
  const suppressed = !evidenceAllowed || (evidenceRequired && permissions.length === 0);

  if (suppressed) {
    return {
      metricId: metric.metricId,
      value: null,
      state: 'SUPPRESSED',
      unit: null,
      currency: null,
      semanticRole: 'SUPPRESSED',
      period: metric.period,
      geography: metric.geography,
      methodologyId: metric.methodologyId,
      methodologyVersion: metric.methodologyVersion,
      quality: {
        status: 'REJECTED',
        confidence: null,
        sampleSize: null,
        coverageRatio: null,
        freshnessStatus: 'UNKNOWN',
        limitations: ['NOT_PUBLICLY_DISTRIBUTABLE'],
      },
      comparabilityKey: null,
      display: metric.display,
      evidenceCount: 0,
    };
  }

  return {
    metricId: metric.metricId,
    value: metric.value,
    state: metric.state,
    unit: metric.unit,
    currency: metric.currency,
    semanticRole: metric.semanticRole,
    period: metric.period,
    geography: metric.geography,
    methodologyId: metric.methodologyId,
    methodologyVersion: metric.methodologyVersion,
    quality: metric.quality,
    comparabilityKey: metric.comparabilityKey,
    display: metric.display,
    evidenceCount: metric.provenance.evidence.length,
  };
}

/**
 * Public serializer is allow-list based: source IDs, raw evidence references,
 * aliases, crosswalks and domain payloads are never exposed.
 */
export function serializeNipsProfileForPublic(profile: NipsNeighborhoodProfile): NipsPublicProfileView {
  const envelopes = [profile.identity, ...Object.values(profile.domains)];
  let suppressedMetricCount = 0;
  let publishableMetricCount = 0;
  let blockedMetricCount = 0;
  let staleMetricCount = 0;
  let unavailableMetricCount = 0;

  const domains: NipsPublicDomain[] = envelopes.map((envelope) => {
    const metrics = envelope.metrics.map((metric) => {
      const serialized = serializePublicMetric(metric);
      if (serialized.state === 'SUPPRESSED') suppressedMetricCount += 1;
      if (serialized.state === 'OBSERVED' ||
          serialized.state === 'ESTIMATED' ||
          serialized.state === 'ALLOCATED') publishableMetricCount += 1;
      if (serialized.state === 'SUPPRESSED' || serialized.state === 'UNDER_REVIEW') blockedMetricCount += 1;
      if (serialized.state === 'STALE') staleMetricCount += 1;
      if (serialized.state === 'UNAVAILABLE' || serialized.state === 'MISSING' ||
          serialized.state === 'NOT_APPLICABLE') unavailableMetricCount += 1;
      return serialized;
    });

    return {
      domainId: envelope.domainId,
      state: envelope.state,
      updatedAt: envelope.updatedAt,
      metrics,
      readiness: {
        publishableMetricCount: metrics.filter((metric) =>
          metric.state === 'OBSERVED' || metric.state === 'ESTIMATED' || metric.state === 'ALLOCATED'
        ).length,
        blockedMetricCount: metrics.filter((metric) =>
          metric.state === 'SUPPRESSED' || metric.state === 'UNDER_REVIEW'
        ).length,
        staleMetricCount: metrics.filter((metric) => metric.state === 'STALE').length,
        unavailableMetricCount: metrics.filter((metric) =>
          metric.state === 'UNAVAILABLE' || metric.state === 'MISSING' || metric.state === 'NOT_APPLICABLE'
        ).length,
        reasons: envelope.readiness.reasons,
      },
    };
  });

  return {
    standardId: 'NIPS-1.0.0',
    catalogVersion: NIPS_CATALOG_VERSION,
    profileId: profile.metadata.profileId,
    profileVersion: profile.metadata.profileVersion,
    canonicalEntityId: profile.identity.data.canonicalEntityId,
    contentHash: profile.metadata.contentHash ?? '',
    identity: {
      registryRevision: profile.identity.data.registryRevision,
      identityStatus: 'CONFIRMED_CANONICAL',
      officialName: profile.identity.data.officialName,
      localizedNames: profile.identity.data.localizedNames,
      parentEntities: profile.identity.data.parentEntities,
    },
    domains,
    quality: {
      domainCount: domains.length,
      readyDomainCount: domains.filter((domain) => domain.state === 'READY').length,
      partialDomainCount: domains.filter((domain) => domain.state === 'PARTIAL').length,
      blockedDomainCount: domains.filter((domain) => domain.state === 'BLOCKED').length,
      staleDomainCount: domains.filter((domain) => domain.state === 'STALE').length,
      publishableMetricCount,
      blockedMetricCount,
      unavailableMetricCount,
      overallReasons: suppressedMetricCount > 0
        ? [...profile.quality.overallReasons, 'Some metrics are withheld by public redistribution policy.']
        : profile.quality.overallReasons,
      suppressedMetricCount,
    },
  };
}

export class NipsProfileReadService {
  constructor(
    private readonly repository: Pick<NipsProfileRepository, 'findSnapshotById' | 'findActivePublication'>,
    private readonly policy: NipsPublicationPolicy
  ) {}

  async getActivePublicProfile(scope: Omit<NipsPublicationScope, 'audience'>): Promise<NipsPublicProfileView | null> {
    const publication = await this.repository.findActivePublication({ ...scope, audience: 'PUBLIC' });
    if (!publication || publication.decision !== 'APPROVED' || publication.status !== 'ACTIVE') return null;
    if (
      publication.canonicalEntityId !== scope.canonicalEntityId ||
      publication.productKey !== scope.productKey ||
      publication.audience !== 'PUBLIC' ||
      publication.policyVersion !== this.policy.version
    ) return null;

    const snapshot = await this.repository.findSnapshotById(publication.snapshotId);
    if (!snapshot || snapshot.identity.data.canonicalEntityId !== scope.canonicalEntityId) return null;

    const evaluation = await evaluateNipsPublicationCandidate(snapshot, scope.canonicalEntityId, this.policy);
    if (!evaluation.approved) return null;

    return serializeNipsProfileForPublic(snapshot);
  }
}
