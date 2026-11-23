import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  GEO_REGISTRY_PUBLISH_ARTIFACTS,
  compareActiveGeographicPublishManifest,
  computeExpectedGeographicPublishBatchId,
  type ActiveGeographicPublishHead,
  type ExpectedGeographicPublishManifest,
  type ImportedGeographicArtifact,
} from '../worker/routes/geographicRegistryPublishManifest';

const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);

const expected: ExpectedGeographicPublishManifest = {
  registryRevision: 19,
  registryChecksum: hashA,
  contractVersion: 'IRNI-GEO-1.0.0',
  idAlgorithmVersion: 'IRGEO-IDENTITY-1.0.0',
  schemaVersion: 'IR-GEO-1.0.0',
  expectedCounts: {
    entities: 9828,
    relationships: 9827,
    sourceMappings: 10341,
    identityEntries: 9828,
    anchors: 9828,
    legacyAliases: 11,
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
  registry_checksum: hashA,
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

test('computes the same stable batch ID as the IRNI Node publisher', async () => {
  const canonicalIdentity = {
    version: 1,
    registryRevision: expected.registryRevision,
    registryChecksum: expected.registryChecksum,
    contractVersion: expected.contractVersion,
    idAlgorithmVersion: expected.idAlgorithmVersion,
    schemaVersion: expected.schemaVersion,
    expectedCounts: {
      entities: expected.expectedCounts.entities,
      relationships: expected.expectedCounts.relationships,
      sourceMappings: expected.expectedCounts.sourceMappings,
      identityEntries: expected.expectedCounts.identityEntries,
      anchors: expected.expectedCounts.anchors,
      legacyAliases: expected.expectedCounts.legacyAliases,
    },
    artifactChecksums: {
      snapshot: expected.artifactChecksums.snapshot,
      relationships: expected.artifactChecksums.relationships,
      sourceMappings: expected.artifactChecksums.sourceMappings,
      identityEntries: expected.artifactChecksums.identityEntries,
      anchors: expected.artifactChecksums.anchors,
      legacyAliases: expected.artifactChecksums.legacyAliases,
    },
  };
  const digest = createHash('sha256').update(JSON.stringify(canonicalIdentity), 'utf8').digest('hex');
  const expectedId = 'irni-r' + expected.registryRevision + '-' + digest;
  assert.equal(await computeExpectedGeographicPublishBatchId(expected), expectedId);
});

test('changes the batch ID when any sidecar checksum or expected count changes', async () => {
  const changedRelationship = {
    ...expected,
    artifactChecksums: { ...expected.artifactChecksums, relationships: hashB },
  };
  const changedCount = {
    ...expected,
    expectedCounts: { ...expected.expectedCounts, relationships: 9828 },
  };
  const originalId = await computeExpectedGeographicPublishBatchId(expected);
  assert.notEqual(await computeExpectedGeographicPublishBatchId(changedRelationship), originalId);
  assert.notEqual(await computeExpectedGeographicPublishBatchId(changedCount), originalId);
});

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

test('rejects an unexpected extra artifact row in the active import ledger', () => {
  const result = compareActiveGeographicPublishManifest({
    activeHead: head,
    expected,
    importedArtifacts: [...imports, {
      artifact_path: 'unexpected/extra.json',
      artifact_sha256: hashA,
      record_count: 1,
      registry_revision: expected.registryRevision,
    }],
  });
  assert.equal(result.matches, false);
  assert.ok(result.mismatches.includes('artifactLedgerCardinality'));
  assert.ok(result.mismatches.includes('unexpectedArtifact:unexpected/extra.json'));
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
