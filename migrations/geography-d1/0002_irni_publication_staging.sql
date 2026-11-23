-- IRNI canonical registry publication staging (additive, resumable, idempotent).
-- The live database already has 0001_geographic_registry.sql applied. This migration
-- adds only publication-control and staging tables; canonical tables are swapped
-- atomically during the finalization D1 batch.

CREATE TABLE IF NOT EXISTS geo_publish_batches (
  batch_id TEXT PRIMARY KEY,
  registry_revision INTEGER NOT NULL,
  registry_checksum TEXT NOT NULL,
  contract_version TEXT NOT NULL,
  id_algorithm_version TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  expected_entities INTEGER NOT NULL,
  expected_relationships INTEGER NOT NULL,
  expected_source_mappings INTEGER NOT NULL,
  expected_identity_registry_entries INTEGER NOT NULL,
  expected_identity_anchors INTEGER NOT NULL,
  expected_legacy_aliases INTEGER NOT NULL,
  artifact_checksums_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('RECEIVING', 'PUBLISHED', 'FAILED')),
  created_at_iso TEXT NOT NULL,
  updated_at_iso TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_geo_publish_batches_revision
  ON geo_publish_batches(registry_revision, status);

CREATE TABLE IF NOT EXISTS geo_publish_nonces (
  nonce TEXT PRIMARY KEY,
  timestamp_seconds INTEGER NOT NULL,
  expires_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_geo_publish_nonces_expiry
  ON geo_publish_nonces(expires_at_ms);

CREATE TABLE IF NOT EXISTS geo_publish_chunks (
  batch_id TEXT NOT NULL,
  dataset_kind TEXT NOT NULL CHECK (dataset_kind IN ('entities', 'relationships', 'sourceMappings', 'identityRegistryEntries', 'identityAnchors', 'legacyAliases')),
  chunk_index INTEGER NOT NULL,
  payload_sha256 TEXT NOT NULL,
  record_count INTEGER NOT NULL,
  received_at_iso TEXT NOT NULL,
  PRIMARY KEY (batch_id, dataset_kind, chunk_index)
);

CREATE TABLE IF NOT EXISTS geo_publish_staging_records (
  batch_id TEXT NOT NULL,
  dataset_kind TEXT NOT NULL CHECK (dataset_kind IN ('entities', 'relationships', 'sourceMappings')),
  record_key TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  record_index INTEGER NOT NULL,
  record_json TEXT NOT NULL CHECK (json_valid(record_json)),
  PRIMARY KEY (batch_id, dataset_kind, record_key)
);

CREATE INDEX IF NOT EXISTS idx_geo_publish_staging_batch_kind_order
  ON geo_publish_staging_records(batch_id, dataset_kind, chunk_index, record_index);
