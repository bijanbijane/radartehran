-- IRNI canonical geographic reference replica. Radar is a read consumer; publisher writes are HMAC authenticated.
CREATE TABLE IF NOT EXISTS geo_registry_heads (
 singleton INTEGER PRIMARY KEY CHECK (singleton=1), registry_revision INTEGER NOT NULL,
 registry_checksum TEXT NOT NULL, contract_version TEXT NOT NULL, id_algorithm_version TEXT NOT NULL,
 schema_version TEXT NOT NULL, total_entities INTEGER NOT NULL, total_relationships INTEGER NOT NULL,
 total_source_mappings INTEGER NOT NULL, published_at_iso TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS geo_publish_batches (
 batch_id TEXT PRIMARY KEY, registry_revision INTEGER NOT NULL, registry_checksum TEXT NOT NULL,
 contract_version TEXT NOT NULL, id_algorithm_version TEXT NOT NULL, schema_version TEXT NOT NULL,
 expected_entities INTEGER NOT NULL, expected_relationships INTEGER NOT NULL,
 expected_source_mappings INTEGER NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('RECEIVING','COMPLETED','REJECTED')),
 created_at_iso TEXT NOT NULL, completed_at_iso TEXT
);
CREATE INDEX IF NOT EXISTS idx_geo_publish_batches_revision ON geo_publish_batches(registry_revision,status);
CREATE TABLE IF NOT EXISTS geo_publish_chunks (
 batch_id TEXT NOT NULL, dataset_kind TEXT NOT NULL CHECK(dataset_kind IN ('entities','relationships','sourceMappings')),
 chunk_index INTEGER NOT NULL, record_count INTEGER NOT NULL, created_at_iso TEXT NOT NULL,
 PRIMARY KEY(batch_id,dataset_kind,chunk_index)
);
CREATE TABLE IF NOT EXISTS geo_publish_nonces (
 nonce TEXT PRIMARY KEY, expires_at_ms INTEGER NOT NULL, recorded_at_iso TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_geo_publish_nonces_expiry ON geo_publish_nonces(expires_at_ms);
CREATE TABLE IF NOT EXISTS geo_entities (
 registry_revision INTEGER NOT NULL, geographic_entity_id TEXT NOT NULL, entity_type TEXT NOT NULL,
 classification_system_id TEXT NOT NULL, canonical_name_fa TEXT NOT NULL,
 parent_geographic_entity_id TEXT, province_geographic_entity_id TEXT,
 identity_status TEXT NOT NULL, verification_status TEXT NOT NULL, lifecycle_status TEXT NOT NULL,
 is_synthetic_fixture INTEGER NOT NULL DEFAULT 0 CHECK(is_synthetic_fixture IN (0,1)),
 record_json TEXT NOT NULL, PRIMARY KEY(registry_revision,geographic_entity_id)
);
CREATE INDEX IF NOT EXISTS idx_geo_entities_revision_type_name ON geo_entities(registry_revision,entity_type,canonical_name_fa);
CREATE INDEX IF NOT EXISTS idx_geo_entities_revision_parent ON geo_entities(registry_revision,parent_geographic_entity_id);
CREATE INDEX IF NOT EXISTS idx_geo_entities_revision_province ON geo_entities(registry_revision,province_geographic_entity_id);
CREATE TABLE IF NOT EXISTS geo_relationships (
 registry_revision INTEGER NOT NULL, relationship_id TEXT NOT NULL,
 source_geographic_entity_id TEXT NOT NULL, target_geographic_entity_id TEXT NOT NULL,
 relationship_type TEXT NOT NULL, classification_system_id TEXT NOT NULL,
 source_dataset_id TEXT NOT NULL, evidence_reference TEXT NOT NULL,
 verification_status TEXT NOT NULL, record_json TEXT NOT NULL,
 PRIMARY KEY(registry_revision,relationship_id)
);
CREATE INDEX IF NOT EXISTS idx_geo_relationships_revision_source ON geo_relationships(registry_revision,source_geographic_entity_id);
CREATE INDEX IF NOT EXISTS idx_geo_relationships_revision_target ON geo_relationships(registry_revision,target_geographic_entity_id);
CREATE TABLE IF NOT EXISTS geo_source_mappings (
 registry_revision INTEGER NOT NULL, mapping_key TEXT NOT NULL,
 identifier_namespace_code TEXT NOT NULL, classification_system_id TEXT NOT NULL,
 entity_type TEXT NOT NULL, source_native_id TEXT NOT NULL,
 geographic_entity_id TEXT NOT NULL, source_dataset_id TEXT NOT NULL,
 resolution_outcome TEXT NOT NULL, record_json TEXT NOT NULL,
 PRIMARY KEY(registry_revision,mapping_key)
);
CREATE INDEX IF NOT EXISTS idx_geo_source_mappings_revision_canonical ON geo_source_mappings(registry_revision,geographic_entity_id);
CREATE INDEX IF NOT EXISTS idx_geo_source_mappings_revision_source ON geo_source_mappings(registry_revision,identifier_namespace_code,source_native_id);
