-- RT-DB-TRIAD-005: widen the publisher chunk contract to all six canonical IRNI datasets.
-- Existing sessions/chunks are preserved; the current production database has no open sessions.
-- This migration is additive and does not modify canonical entity data.

CREATE TABLE geo_registry_publish_chunks_v4 (
  batch_id TEXT NOT NULL,
  dataset_kind TEXT NOT NULL CHECK (
    dataset_kind IN ('entities','relationships','sourceMappings','identityEntries','anchors','legacyAliases')
  ),
  chunk_index INTEGER NOT NULL,
  record_count INTEGER NOT NULL,
  chunk_sha256 TEXT NOT NULL,
  created_at_iso TEXT NOT NULL,
  PRIMARY KEY (batch_id, dataset_kind, chunk_index)
);

INSERT INTO geo_registry_publish_chunks_v4
  (batch_id,dataset_kind,chunk_index,record_count,chunk_sha256,created_at_iso)
SELECT batch_id,dataset_kind,chunk_index,record_count,chunk_sha256,created_at_iso
FROM geo_registry_publish_chunks;

DROP TABLE geo_registry_publish_chunks;
ALTER TABLE geo_registry_publish_chunks_v4 RENAME TO geo_registry_publish_chunks;

CREATE UNIQUE INDEX IF NOT EXISTS idx_geo_registry_identity_anchor_stage_entity
  ON geo_registry_identity_anchor_stage(batch_id, geographic_entity_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_geo_registry_legacy_alias_stage_key
  ON geo_registry_legacy_alias_stage(batch_id, legacy_system_code, legacy_identifier_value);

CREATE UNIQUE INDEX IF NOT EXISTS idx_geo_legacy_alias_unique_key
  ON geo_legacy_aliases(legacy_system_code, legacy_identifier_value);
