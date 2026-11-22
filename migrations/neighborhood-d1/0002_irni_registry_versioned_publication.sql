-- RT-DB-TRIAD-003: Versioned staging for the IRNI-authoritative geographic registry.
-- Existing geo_* identity tables remain intact. A completed batch becomes visible only
-- through geo_registry_publish_pointer; partial imports never replace the active revision.

CREATE TABLE IF NOT EXISTS geo_registry_publish_sessions (
  batch_id TEXT PRIMARY KEY,
  registry_revision INTEGER NOT NULL,
  registry_checksum TEXT NOT NULL,
  contract_version TEXT NOT NULL,
  id_algorithm_version TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  expected_entities INTEGER NOT NULL,
  expected_relationships INTEGER NOT NULL,
  expected_source_mappings INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('RECEIVING','COMPLETED','REJECTED')),
  created_at_iso TEXT NOT NULL,
  completed_at_iso TEXT
);
CREATE INDEX IF NOT EXISTS idx_geo_registry_publish_sessions_revision
  ON geo_registry_publish_sessions(registry_revision, status);

CREATE TABLE IF NOT EXISTS geo_registry_publish_chunks (
  batch_id TEXT NOT NULL,
  dataset_kind TEXT NOT NULL CHECK (dataset_kind IN ('entities','relationships','sourceMappings')),
  chunk_index INTEGER NOT NULL,
  record_count INTEGER NOT NULL,
  chunk_sha256 TEXT NOT NULL,
  created_at_iso TEXT NOT NULL,
  PRIMARY KEY (batch_id, dataset_kind, chunk_index)
);

CREATE TABLE IF NOT EXISTS geo_registry_publish_nonces (
  nonce TEXT PRIMARY KEY,
  expires_at_ms INTEGER NOT NULL,
  recorded_at_iso TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_geo_registry_publish_nonces_expiry
  ON geo_registry_publish_nonces(expires_at_ms);

CREATE TABLE IF NOT EXISTS geo_registry_entity_stage (
  batch_id TEXT NOT NULL,
  geographic_entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  classification_system_id TEXT NOT NULL,
  canonical_name_fa TEXT NOT NULL,
  parent_geographic_entity_id TEXT,
  province_geographic_entity_id TEXT,
  identity_status TEXT NOT NULL,
  verification_status TEXT NOT NULL,
  lifecycle_status TEXT NOT NULL,
  is_synthetic_fixture INTEGER NOT NULL DEFAULT 0 CHECK (is_synthetic_fixture = 0),
  entity_json TEXT NOT NULL,
  PRIMARY KEY (batch_id, geographic_entity_id)
);
CREATE INDEX IF NOT EXISTS idx_geo_registry_entity_stage_type_name
  ON geo_registry_entity_stage(batch_id, entity_type, canonical_name_fa);
CREATE INDEX IF NOT EXISTS idx_geo_registry_entity_stage_parent
  ON geo_registry_entity_stage(batch_id, parent_geographic_entity_id);
CREATE INDEX IF NOT EXISTS idx_geo_registry_entity_stage_province
  ON geo_registry_entity_stage(batch_id, province_geographic_entity_id);

CREATE TABLE IF NOT EXISTS geo_registry_relationship_stage (
  batch_id TEXT NOT NULL,
  relationship_id TEXT NOT NULL,
  source_geographic_entity_id TEXT NOT NULL,
  target_geographic_entity_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL,
  classification_system_id TEXT NOT NULL,
  source_dataset_id TEXT NOT NULL,
  verification_status TEXT NOT NULL,
  relationship_json TEXT NOT NULL,
  PRIMARY KEY (batch_id, relationship_id)
);
CREATE INDEX IF NOT EXISTS idx_geo_registry_relationship_stage_source
  ON geo_registry_relationship_stage(batch_id, source_geographic_entity_id);
CREATE INDEX IF NOT EXISTS idx_geo_registry_relationship_stage_target
  ON geo_registry_relationship_stage(batch_id, target_geographic_entity_id);

CREATE TABLE IF NOT EXISTS geo_registry_source_mapping_stage (
  batch_id TEXT NOT NULL,
  mapping_key TEXT NOT NULL,
  identifier_namespace_code TEXT NOT NULL,
  classification_system_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  source_native_id TEXT NOT NULL,
  geographic_entity_id TEXT NOT NULL,
  source_dataset_id TEXT NOT NULL,
  resolution_outcome TEXT NOT NULL,
  committed_at_registry_revision INTEGER NOT NULL,
  mapping_json TEXT NOT NULL,
  PRIMARY KEY (batch_id, mapping_key)
);
CREATE INDEX IF NOT EXISTS idx_geo_registry_source_mapping_stage_canonical
  ON geo_registry_source_mapping_stage(batch_id, geographic_entity_id);
CREATE INDEX IF NOT EXISTS idx_geo_registry_source_mapping_stage_source
  ON geo_registry_source_mapping_stage(batch_id, identifier_namespace_code, source_native_id);

CREATE TABLE IF NOT EXISTS geo_registry_publish_pointer (
  singleton_id TEXT PRIMARY KEY CHECK (singleton_id = 'current'),
  batch_id TEXT NOT NULL,
  registry_revision INTEGER NOT NULL,
  registry_checksum TEXT NOT NULL,
  activated_at_iso TEXT NOT NULL
);
