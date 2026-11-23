/** Server-authoritative dataset classification — RT-ANALYTICS-CRITICAL-034 */
export type DatasetClassification = 'PUBLIC' | 'INTERNAL' | 'RESTRICTED';

export interface DatasetRegistryEntry {
  datasetId: string;
  canonicalSource: string;
  dataClassification: DatasetClassification;
  allowedTransformations: readonly string[];
  allowedExportFormats: readonly ('csv' | 'json')[];
  minimumSampleCount: number;
  minimumDistinctEntities: number;
  allowedCallerRoles: readonly ('PUBLIC_USER' | 'RESEARCHER' | 'ADMIN')[];
  allowedGeographicGranularity: 'national' | 'city' | 'neighborhood';
  retentionPolicyDays: number;
  publicReleasePolicy: 'ALLOW_WITH_LIMITATIONS' | 'DENY' | 'ADMIN_ONLY';
}

const DEFAULT_EXPORT_FORMATS = ['csv', 'json'] as const;

function entry(
  datasetId: string,
  canonicalSource: string,
  dataClassification: DatasetClassification,
  overrides?: Partial<Omit<DatasetRegistryEntry, 'datasetId' | 'canonicalSource' | 'dataClassification'>>,
): DatasetRegistryEntry {
  return {
    datasetId,
    canonicalSource,
    dataClassification,
    allowedTransformations: overrides?.allowedTransformations ?? ['aggregate', 'distribution_snapshot'],
    allowedExportFormats: overrides?.allowedExportFormats ?? DEFAULT_EXPORT_FORMATS,
    minimumSampleCount: overrides?.minimumSampleCount ?? (dataClassification === 'PUBLIC' ? 3 : 10),
    minimumDistinctEntities: overrides?.minimumDistinctEntities ?? 1,
    allowedCallerRoles:
      overrides?.allowedCallerRoles ??
      (dataClassification === 'PUBLIC'
        ? ['PUBLIC_USER', 'RESEARCHER', 'ADMIN']
        : dataClassification === 'INTERNAL'
          ? ['RESEARCHER', 'ADMIN']
          : ['ADMIN']),
    allowedGeographicGranularity: overrides?.allowedGeographicGranularity ?? 'neighborhood',
    retentionPolicyDays: overrides?.retentionPolicyDays ?? 30,
    publicReleasePolicy:
      overrides?.publicReleasePolicy ??
      (dataClassification === 'PUBLIC' ? 'ALLOW_WITH_LIMITATIONS' : 'ADMIN_ONLY'),
  };
}

const REGISTRY: readonly DatasetRegistryEntry[] = [
  entry('analytics.place.metric_snapshot', 'analytics-research-state.json', 'PUBLIC', {
    minimumSampleCount: 3,
    publicReleasePolicy: 'ALLOW_WITH_LIMITATIONS',
  }),
  entry('analytics.place.metric_snapshot.internal', 'analytics-research-state.json', 'INTERNAL'),
  entry('analytics.research.quarantine_review', 'analytics-research-state.json', 'RESTRICTED', {
    minimumSampleCount: 25,
    publicReleasePolicy: 'DENY',
  }),
];

export function resolveDatasetIdForExport(placeId: string | null): string {
  return placeId ? 'analytics.place.metric_snapshot' : 'analytics.place.metric_snapshot';
}

export function lookupDatasetRegistry(datasetId: string): DatasetRegistryEntry | null {
  return REGISTRY.find((e) => e.datasetId === datasetId) ?? null;
}

export function classifyExportFromRegistry(
  datasetId: string,
  clientSentClassification?: unknown,
): { classification: DatasetClassification; clientMismatch: boolean } {
  const reg = lookupDatasetRegistry(datasetId);
  if (!reg) {
    return { classification: 'RESTRICTED', clientMismatch: Boolean(clientSentClassification) };
  }
  const clientMismatch =
    typeof clientSentClassification === 'string' &&
    clientSentClassification !== reg.dataClassification;
  return { classification: reg.dataClassification, clientMismatch };
}

export function strictestClassification(
  levels: readonly DatasetClassification[],
): DatasetClassification {
  if (levels.includes('RESTRICTED')) return 'RESTRICTED';
  if (levels.includes('INTERNAL')) return 'INTERNAL';
  return 'PUBLIC';
}