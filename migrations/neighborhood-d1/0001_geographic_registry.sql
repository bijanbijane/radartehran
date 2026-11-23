-- IRNI canonical geographic registry baseline (revision-8 schema).
-- This file records the exact baseline already present in radar-neighborhood-db.
-- Existing D1 ledger entry: 0001_geographic_registry.sql.
-- Safe for a fresh database and idempotent against the already-provisioned database.
-- Canonical identity is owned by IRNI; Radar may only consume the published replica.

CREATE TABLE IF NOT EXISTS geo_canonical_entities (
  geographic_entity_id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  classification_system_id TEXT NOT NULL,
  canonical_name_fa TEXT NOT NULL,
  parent_geographic_entity_id TEXT,
  province_geographic_entity_id TEXT,
  identity_status TEXT NOT NULL,
  verification_status TEXT NOT NULL,
  lifecycle_status TEXT NOT NULL,
  is_synthetic_fixture INTEGER NOT NULL CHECK (is_synthetic_fixture IN (0, 1)),
  entity_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS geo_identity_anchors (
  identity_anchor TEXT PRIMARY KEY,
  geographic_entity_id TEXT NOT NULL,
  anchor_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  classification_system_id TEXT NOT NULL,
  fallback_token TEXT,
  issued_at_registry_revision INTEGER NOT NULL,
  immutable INTEGER NOT NULL CHECK (immutable = 1),
  anchor_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS geo_identity_registry_entries (
  geographic_entity_id TEXT PRIMARY KEY,
  identity_anchor TEXT NOT NULL,
  anchor_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  classification_system_id TEXT NOT NULL,
  canonical_name_fa TEXT NOT NULL,
  identity_status TEXT NOT NULL,
  issued_at_registry_revision INTEGER NOT NULL,
  issued_order_index INTEGER NOT NULL,
  surviving_geographic_entity_id TEXT,
  retired_reason TEXT,
  retired_at_registry_revision INTEGER,
  entry_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS geo_legacy_aliases (
  alias_id TEXT PRIMARY KEY,
  legacy_system_code TEXT NOT NULL,
  legacy_identifier_value TEXT NOT NULL,
  canonical_geographic_entity_id TEXT NOT NULL,
  alias_status TEXT NOT NULL,
  resolution_evidence_ref TEXT NOT NULL,
  recorded_at_registry_revision INTEGER NOT NULL,
  alias_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS geo_registry_head (
  singleton_id TEXT PRIMARY KEY CHECK (singleton_id = 'current'),
  contract_version TEXT NOT NULL,
  id_algorithm_version TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  registry_revision INTEGER NOT NULL,
  previous_registry_revision INTEGER,
  registry_checksum TEXT NOT NULL,
  canonical_entry_count INTEGER NOT NULL,
  canonical_entity_count INTEGER NOT NULL,
  relationship_count INTEGER NOT NULL,
  anchor_count INTEGER NOT NULL,
  source_mapping_count INTEGER NOT NULL,
  legacy_alias_count INTEGER NOT NULL,
  duplicate_conflict_count INTEGER NOT NULL,
  integrity_verified INTEGER NOT NULL CHECK (integrity_verified IN (0, 1)),
  imported_at_iso TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS geo_registry_imports (
  artifact_path TEXT PRIMARY KEY,
  artifact_sha256 TEXT NOT NULL,
  record_count INTEGER NOT NULL,
  registry_revision INTEGER NOT NULL,
  imported_at_iso TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS geo_relationships (
  relationship_id TEXT PRIMARY KEY,
  source_geographic_entity_id TEXT NOT NULL,
  target_geographic_entity_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL,
  classification_system_id TEXT NOT NULL,
  source_dataset_id TEXT NOT NULL,
  verification_status TEXT NOT NULL,
  relationship_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS geo_source_mappings (
  mapping_key TEXT PRIMARY KEY,
  identifier_namespace_code TEXT NOT NULL,
  classification_system_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  source_native_id TEXT NOT NULL,
  geographic_entity_id TEXT NOT NULL,
  source_dataset_id TEXT NOT NULL,
  resolution_outcome TEXT NOT NULL,
  committed_at_registry_revision INTEGER NOT NULL,
  mapping_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_geo_anchors_entity
  ON geo_identity_anchors(geographic_entity_id);
CREATE INDEX IF NOT EXISTS idx_geo_entities_lifecycle
  ON geo_canonical_entities(lifecycle_status, identity_status, is_synthetic_fixture);
CREATE INDEX IF NOT EXISTS idx_geo_entities_parent
  ON geo_canonical_entities(parent_geographic_entity_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_geo_entities_province
  ON geo_canonical_entities(province_geographic_entity_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_geo_entities_type_name
  ON geo_canonical_entities(entity_type, canonical_name_fa);
CREATE INDEX IF NOT EXISTS idx_geo_identity_entries_anchor
  ON geo_identity_registry_entries(identity_anchor);
CREATE INDEX IF NOT EXISTS idx_geo_identity_entries_status
  ON geo_identity_registry_entries(identity_status, entity_type);
CREATE INDEX IF NOT EXISTS idx_geo_legacy_alias_lookup
  ON geo_legacy_aliases(legacy_system_code, legacy_identifier_value);
CREATE INDEX IF NOT EXISTS idx_geo_relationships_source_type
  ON geo_relationships(source_geographic_entity_id, relationship_type);
CREATE INDEX IF NOT EXISTS idx_geo_relationships_target_type
  ON geo_relationships(target_geographic_entity_id, relationship_type);
CREATE INDEX IF NOT EXISTS idx_geo_source_mappings_entity
  ON geo_source_mappings(geographic_entity_id);
CREATE INDEX IF NOT EXISTS idx_geo_source_mappings_lookup
  ON geo_source_mappings(identifier_namespace_code, classification_system_id, entity_type, source_native_id);
