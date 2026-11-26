import type { GeographicLevel } from './neighborhoodProfileObservationContract';

export type ProfileDomainId =
  | 'identity'
  | 'boundary'
  | 'market'
  | 'housing'
  | 'land_use'
  | 'mobility'
  | 'services'
  | 'environment'
  | 'demographics'
  | 'urban_change'
  | 'sources';

export type ProfileDomainState =
  | 'READY'
  | 'PARTIAL'
  | 'STALE'
  | 'BLOCKED'
  | 'UNAVAILABLE'
  | 'NOT_APPLICABLE';

export interface ProfileDomainReadiness {
  readonly domainId: ProfileDomainId;
  readonly state: ProfileDomainState;
  readonly publishableMetricCount: number;
  readonly blockedMetricCount: number;
  readonly reasons: readonly string[];
}

export type ProfilePublicationState = 'PUBLISHED' | 'PROVISIONAL' | 'DRAFT';

function validCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function deriveProfilePublicationState(
  domains: readonly ProfileDomainReadiness[],
  requiredDomainIds: readonly ProfileDomainId[],
): ProfilePublicationState {
  if (requiredDomainIds.length === 0) return 'DRAFT';

  const seen = new Set<ProfileDomainId>();
  for (const domain of domains) {
    if (seen.has(domain.domainId) || !validCount(domain.publishableMetricCount)
      || !validCount(domain.blockedMetricCount)) {
      return 'DRAFT';
    }
    seen.add(domain.domainId);
  }

  const byId = new Map(domains.map((domain) => [domain.domainId, domain]));
  const required = requiredDomainIds.map((id) => byId.get(id));
  if (required.some((domain) => !domain)) return 'DRAFT';

  const values = required as ProfileDomainReadiness[];
  if (values.some((domain) =>
    domain.state === 'BLOCKED'
    || domain.state === 'UNAVAILABLE'
    || domain.state === 'STALE'
    || (domain.state === 'READY'
      && (domain.publishableMetricCount === 0 || domain.blockedMetricCount > 0))
    || (domain.state === 'PARTIAL'
      && domain.publishableMetricCount === 0 && domain.blockedMetricCount === 0)
  )) {
    return 'DRAFT';
  }

  if (values.some((domain) =>
    domain.state === 'PARTIAL'
    || domain.state === 'NOT_APPLICABLE'
    || domain.blockedMetricCount > 0
  )) {
    return 'PROVISIONAL';
  }

  if (values.some((domain) => domain.state !== 'READY' || domain.publishableMetricCount < 1)) {
    return 'DRAFT';
  }

  return 'PUBLISHED';
}

export interface NeighborhoodMetricComparisonContext {
  readonly variableId: string;
  readonly unit: string;
  readonly metricRole: string;
  readonly referencePeriod: string;
  readonly methodologyVersion: string;
  readonly geographicResolution: GeographicLevel;
  readonly cityId: string;
  /** Shared administrative boundary definition, not each neighborhood's own polygon version. */
  readonly boundarySchemeId: string;
  readonly boundarySchemeVersion: string;
  readonly geographicRegistryRevision: number;
  readonly currencyNormalizationPolicyVersion: string;
}

export function areNeighborhoodMetricsComparable(
  left: NeighborhoodMetricComparisonContext,
  right: NeighborhoodMetricComparisonContext,
): boolean {
  return left.variableId === right.variableId
    && left.unit === right.unit
    && left.metricRole === right.metricRole
    && left.referencePeriod === right.referencePeriod
    && left.methodologyVersion === right.methodologyVersion
    && left.geographicResolution === right.geographicResolution
    && left.cityId === right.cityId
    && left.boundarySchemeId === right.boundarySchemeId
    && left.boundarySchemeVersion === right.boundarySchemeVersion
    && left.geographicRegistryRevision === right.geographicRegistryRevision
    && left.currencyNormalizationPolicyVersion === right.currencyNormalizationPolicyVersion;
}

export interface NeighborhoodProfileCacheContext {
  readonly geographicEntityId: string;
  readonly registryRevision: number;
  readonly boundaryVersionId: string | null;
  readonly boundaryGeometrySha256: string | null;
  readonly observationsWatermark: string;
  readonly methodologyVersion: string;
  readonly variableCatalogVersion: string;
  readonly sourceRegistryRevision: number;
  readonly publicationPolicyVersion: string;
}

export function buildNeighborhoodProfileCacheKey(input: NeighborhoodProfileCacheContext): string {
  return [
    input.geographicEntityId,
    'r' + input.registryRevision,
    'b' + (input.boundaryVersionId ?? 'none'),
    'g' + (input.boundaryGeometrySha256 ?? 'none'),
    'o' + input.observationsWatermark,
    'm' + input.methodologyVersion,
    'v' + input.variableCatalogVersion,
    's' + input.sourceRegistryRevision,
    'p' + input.publicationPolicyVersion,
  ].join(':');
}
