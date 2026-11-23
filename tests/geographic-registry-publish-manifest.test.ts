import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GEO_REGISTRY_PUBLISH_ARTIFACTS,
  compareActiveGeographicPublishManifest,
  type ActiveGeographicPublishHead,
  type ExpectedGeographicPublishManifest,
  type ImportedGeographicArtifact,
} from '../worker/routes/geographicRegistryPublishManifest';

const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);

const expected: ExpectedGeographicPublishManifest = {
  registryRevision: 19,
  contractVersion: 'IRNI-GEO-1.0.0',
  idAlgorithmVersion: 'IRGEO-IDENTITY-1.0.0',
  schemaVersion: 'IR-GEO-1.0.0',
  expectedCounts: {
    entities: 9828,
    relationships: 9827,
    sourceMappings: 10341,
    identityEntries: 9828,
    anchors: 9828,
    legacyAliases: 10,
  },
  artifactChecksums: {
    snapshot: hashA,
    relationships: hashA,
    sourceMappings: hashA,
    identityEntries: hashA,
    anchors: hashA,
    legacyAliases: hashA,
  },
};

const head: ActiveGeographicPublishHead = {
  registry_revision: 19,
  contract_version: 'IRNI-GEO-1.0.0',
  id_algorithm_version: 'IRGEO-IDENTITY-1.0.0',
  schema_version: 'IR-GEO-1.0.0',
  canonical_entry_count: 9828,
  canonical_entity_count: 9828,
  relationship_count: 9827,
  anchor_count: 9828,
  source_mapping_count: 10341,
  legacy_alias_count: 10,
  integrity_verified: 1,
};

const imports: ImportedGeographicArtifact[] = GEO_REGISTRY_PUBLISH_ARTIFACTS.map((artifact) => ({
  artifact_path: artifact.artifactPath,
  artifact_sha256: expected.artifactChecksums[artifact.checksumKey],
  record_count: expected.expectedCounts[artifact.countKey],
  registry_revision: expected.registryRevision,
}));

test('accepts a complete active six-dataset manifest that exactly matches D1', () => {
  const result = compareActiveGeographicPublishManifest({
    activeHead: head,
    expected,
    importedArtifacts: imports,
  });
  assert.deepEqual(result, { matches: true, mismatches: [] });
});

test('rejects a relationship-only change even when the registry revision is unchanged', () => {
  const changed = {
    ...expected,
    artifactChecksums: { ...expected.artifactChecksums, relationships: hashB },
  };
  const result = compareActiveGeographicPublishManifest({
    activeHead: head,
    expected: changed,
    importedArtifacts: imports,
  });
  assert.equal(result.matches, false);
  assert.ok(result.mismatches.includes('artifactChecksum:relationships'));
});

test('rejects a missing import ledger row', () => {
  const result = compareActiveGeographicPublishManifest({
    activeHead: head,
    expected,
    importedArtifacts: imports.filter((row) => row.artifact_path !== GEO_REGISTRY_PUBLISH_ARTIFACTS[2].artifactPath),
  });
  assert.equal(result.matches, false);
  assert.ok(result.mismatches.includes('missingArtifact:sourceMappings'));
});

test('rejects a different record count even when the artifact checksum matches', () => {
  const changed = imports.map((row) => row.artifact_path === GEO_REGISTRY_PUBLISH_ARTIFACTS[1].artifactPath
    ? { ...row, record_count: row.record_count + 1 }
    : row);
  const result = compareActiveGeographicPublishManifest({
    activeHead: head,
    expected,
    importedArtifacts: changed,
  });
  assert.equal(result.matches, false);
  assert.ok(result.mismatches.includes('artifactCount:relationships'));
});

test('rejects artifacts recorded under a different revision', () => {
  const changed = imports.map((row) => ({ ...row, registry_revision: 18 }));
  const result = compareActiveGeographicPublishManifest({
    activeHead: head,
    expected,
    importedArtifacts: changed,
  });
  assert.equal(result.matches, false);
  assert.equal(result.mismatches.length, 6);
});

test('rejects an unverified or metadata-mismatched head', () => {
  const result = compareActiveGeographicPublishManifest({
    activeHead: { ...head, integrity_verified: 0, contract_version: 'IRNI-GEO-0.9.0' },
    expected,
    importedArtifacts: imports,
  });
  assert.equal(result.matches, false);
  assert.ok(result.mismatches.includes('integrityVerified'));
  assert.ok(result.mismatches.includes('contractVersion'));
});
