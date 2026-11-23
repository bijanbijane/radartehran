-- RT-DB-TRIAD-004: Complete immutable IRNI identity staging for atomic registry publication.
-- Adds the identity-entry, immutable-anchor and legacy-alias datasets required by the
-- publisher/finalizer. Existing canonical tables are not dropped or rewritten here.

ALTER TABLE geo_registry_publish_sessions
  ADD COLUMN expected_identity_entries INTEGER NOT NULL DEFAULT 0;
ALTER TABLE geo_registry_publish_sessions
  ADD COLUMN expected_anchors INTEGER NOT NULL DEFAULT 0;
ALTER TABLE geo_registry_publish_sessions
  ADD COLUMN expected_legacy_aliases INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS geo_registry_identity_entry_stage (
  batch_id TEXT NOT NULL,
  geographic_entity_id TEXT NOT NULL,
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
  entry_json TEXT NOT NULL,
  PRIMARY KEY (batch_id, geographic_entity_id)
);
CREATE INDEX IF NOT EXISTS idx_geo_registry_identity_entry_stage_anchor
  ON geo_registry_identity_entry_stage(batch_id, identity_anchor);
CREATE INDEX IF NOT EXISTS idx_geo_registry_identity_entry_stage_status
  ON geo_registry_identity_entry_stage(batch_id, identity_status, entity_type);

CREATE TABLE IF NOT EXISTS geo_registry_identity_anchor_stage (
  batch_id TEXT NOT NULL,
  identity_anchor TEXT NOT NULL,
  geographic_entity_id TEXT NOT NULL,
  anchor_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  classification_system_id TEXT NOT NULL,
  fallback_token TEXT,
  issued_at_registry_revision INTEGER NOT NULL,
  immutable INTEGER NOT NULL CHECK (immutable = 1),
  anchor_json TEXT NOT NULL,
  PRIMARY KEY (batch_id, identity_anchor)
);
CREATE INDEX IF NOT EXISTS idx_geo_registry_identity_anchor_stage_entity
  ON geo_registry_identity_anchor_stage(batch_id, geographic_entity_id);

CREATE TABLE IF NOT EXISTS geo_registry_legacy_alias_stage (
  batch_id TEXT NOT NULL,
  alias_id TEXT NOT NULL,
  legacy_system_code TEXT NOT NULL,
  legacy_identifier_value TEXT NOT NULL,
  canonical_geographic_entity_id TEXT NOT NULL,
  alias_status TEXT NOT NULL,
  resolution_evidence_ref TEXT NOT NULL,
  recorded_at_registry_revision INTEGER NOT NULL,
  alias_json TEXT NOT NULL,
  PRIMARY KEY (batch_id, alias_id)
);
CREATE INDEX IF NOT EXISTS idx_geo_registry_legacy_alias_stage_canonical
  ON geo_registry_legacy_alias_stage(batch_id, canonical_geographic_entity_id);
CREATE INDEX IF NOT EXISTS idx_geo_registry_legacy_alias_stage_lookup
  ON geo_registry_legacy_alias_stage(batch_id, legacy_system_code, legacy_identifier_value);
