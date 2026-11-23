-- RT-DB-TRIAD-006: one immutable anchor per canonical entity per publication batch.
-- The previous non-unique lookup index is retained for compatibility; this adds the
-- actual uniqueness invariant required by the six-dataset publisher.
CREATE UNIQUE INDEX IF NOT EXISTS idx_geo_registry_identity_anchor_stage_entity_unique
  ON geo_registry_identity_anchor_stage(batch_id, geographic_entity_id);
