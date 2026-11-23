export const GEO_REGISTRY_PUBLISH_ARTIFACTS = [
  {
    artifactPath: 'public/data/geography/national-registry-snapshot.json',
    checksumKey: 'snapshot',
    countKey: 'entities',
  },
  {
    artifactPath: 'data/geography/normalized/geographic-relationships.json',
    checksumKey: 'relationships',
    countKey: 'relationships',
  },
  {
    artifactPath: 'data/geography/identity/GEOGRAPHIC-SOURCE-ID-MAPPINGS.json',
    checksumKey: 'sourceMappings',
    countKey: 'sourceMappings',
  },
  {
    artifactPath: 'data/geography/identity/GEOGRAPHIC-CANONICAL-ID-REGISTRY.json',
    checksumKey: 'identityEntries',
    countKey: 'identityEntries',
  },
  {
    artifactPath: 'data/geography/identity/GEOGRAPHIC-IDENTITY-ANCHOR-REGISTER.json',
    checksumKey: 'anchors',
    countKey: 'anchors',
  },
  {
    artifactPath: 'data/geography/identity/GEOGRAPHIC-LEGACY-ID-ALIASES.json',
    checksumKey: 'legacyAliases',
    countKey: 'legacyAliases',
  },
] as const;

export type GeographicPublishCountKey =
  | 'entities'
  | 'relationships'
  | 'sourceMappings'
  | 'identityEntries'
  | 'anchors'
  | 'legacyAliases';

export interface ExpectedGeographicPublishManifest {
  readonly registryRevision: number;
  readonly registryChecksum: string;
  readonly contractVersion: string;
  readonly idAlgorithmVersion: string;
  readonly schemaVersion: string;
  readonly expectedCounts: Readonly<Record<GeographicPublishCountKey, number>>;
  readonly artifactChecksums: Readonly<Record<
    'snapshot' | 'relationships' | 'sourceMappings' | 'identityEntries' | 'anchors' | 'legacyAliases',
    string
  >>;
}

export interface ActiveGeographicPublishHead {
  readonly registry_revision: number;
  readonly contract_version: string;
  readonly id_algorithm_version: string;
  readonly schema_version: string;
  readonly canonical_entry_count: number;
  readonly canonical_entity_count: number;
  readonly relationship_count: number;
  readonly anchor_count: number;
  readonly source_mapping_count: number;
  readonly legacy_alias_count: number;
  readonly integrity_verified: number;
}

export interface ImportedGeographicArtifact {
  readonly artifact_path: string;
  readonly artifact_sha256: string;
  readonly record_count: number;
  readonly registry_revision: number;
}

export interface GeographicPublishManifestComparison {
  readonly matches: boolean;
  readonly mismatches: readonly string[];
}

/**
 * Compute the exact stable batch ID used by IRNI's Node publisher.
 *
 * Property order and normalized key order are intentionally explicit. Keep
 * this contract aligned with scripts/registry-publish-batch-id.mjs in IRNI.
 */
export async function computeExpectedGeographicPublishBatchId(
  manifest: ExpectedGeographicPublishManifest,
): Promise<string> {
  const canonicalIdentity = {
    version: 1,
    registryRevision: manifest.registryRevision,
    registryChecksum: manifest.registryChecksum.toLowerCase(),
    contractVersion: manifest.contractVersion,
    idAlgorithmVersion: manifest.idAlgorithmVersion,
    schemaVersion: manifest.schemaVersion,
    expectedCounts: {
      entities: manifest.expectedCounts.entities,
      relationships: manifest.expectedCounts.relationships,
      sourceMappings: manifest.expectedCounts.sourceMappings,
      identityEntries: manifest.expectedCounts.identityEntries,
      anchors: manifest.expectedCounts.anchors,
      legacyAliases: manifest.expectedCounts.legacyAliases,
    },
    artifactChecksums: {
      snapshot: manifest.artifactChecksums.snapshot.toLowerCase(),
      relationships: manifest.artifactChecksums.relationships.toLowerCase(),
      sourceMappings: manifest.artifactChecksums.sourceMappings.toLowerCase(),
      identityEntries: manifest.artifactChecksums.identityEntries.toLowerCase(),
      anchors: manifest.artifactChecksums.anchors.toLowerCase(),
      legacyAliases: manifest.artifactChecksums.legacyAliases.toLowerCase(),
    },
  };
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(canonicalIdentity)),
  );
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return 'irni-r' + manifest.registryRevision + '-' + hex;
}

/**
 * Verify that the active head and its six import-ledger rows represent the
 * exact source manifest being offered for publication.
 *
 * registryChecksum deliberately describes the canonical identity registry;
 * the relationship artifact has its own checksum and is not covered by it.
 * An equal revision/checksum alone therefore cannot prove six-dataset equality.
 */
export function compareActiveGeographicPublishManifest(input: {
  readonly activeHead: ActiveGeographicPublishHead;
  readonly expected: ExpectedGeographicPublishManifest;
  readonly importedArtifacts: readonly ImportedGeographicArtifact[];
}): GeographicPublishManifestComparison {
  const { activeHead, expected, importedArtifacts } = input;
  const mismatches: string[] = [];

  if (Number(activeHead.registry_revision) !== expected.registryRevision) mismatches.push('registryRevision');
  if (activeHead.contract_version !== expected.contractVersion) mismatches.push('contractVersion');
  if (activeHead.id_algorithm_version !== expected.idAlgorithmVersion) mismatches.push('idAlgorithmVersion');
  if (activeHead.schema_version !== expected.schemaVersion) mismatches.push('schemaVersion');
  if (Number(activeHead.integrity_verified) !== 1) mismatches.push('integrityVerified');

  const headCounts: Readonly<Record<GeographicPublishCountKey, number>> = {
    entities: Number(activeHead.canonical_entity_count),
    relationships: Number(activeHead.relationship_count),
    sourceMappings: Number(activeHead.source_mapping_count),
    identityEntries: Number(activeHead.canonical_entry_count),
    anchors: Number(activeHead.anchor_count),
    legacyAliases: Number(activeHead.legacy_alias_count),
  };
  for (const key of Object.keys(headCounts) as GeographicPublishCountKey[]) {
    if (headCounts[key] !== Number(expected.expectedCounts[key])) {
      mismatches.push('headCount:' + key);
    }
  }

  const rowsByPath = new Map(importedArtifacts.map((row) => [row.artifact_path, row]));
  for (const artifact of GEO_REGISTRY_PUBLISH_ARTIFACTS) {
    const row = rowsByPath.get(artifact.artifactPath);
    const label = artifact.checksumKey;
    if (!row) {
      mismatches.push('missingArtifact:' + label);
      continue;
    }
    if (Number(row.registry_revision) !== expected.registryRevision) {
      mismatches.push('artifactRevision:' + label);
    }
    const expectedSha = String(expected.artifactChecksums[artifact.checksumKey] || '').toLowerCase();
    const storedSha = String(row.artifact_sha256 || '').toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(expectedSha) || storedSha !== expectedSha) {
      mismatches.push('artifactChecksum:' + label);
    }
    if (Number(row.record_count) !== Number(expected.expectedCounts[artifact.countKey])) {
      mismatches.push('artifactCount:' + label);
    }
  }

  return { matches: mismatches.length === 0, mismatches };
}
