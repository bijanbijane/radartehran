-- NIPS logical D1 schema reference — DESIGN ONLY.
-- NOT a migration. Do not run with wrangler d1 migrations apply.
-- Target physical D1: radar-neighborhood-db (shared; owned and migrated only by IRNI).
-- NIPS owns only the logical nips_* records; Radar must access them through a separately
-- versioned, authenticated, purpose-scoped IRNI Worker RPC. Radar must not bind this D1.
-- USER_DB and RESEARCH_DB remain isolated; neither is a substitute for NIPS persistence.
-- External references (IRNI entity IDs, source IDs, boundary IDs) have no cross-DB FK.

PRAGMA foreign_keys = ON;

CREATE TABLE nips_variables (
  variable_id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL CHECK (domain_id IN ('identity','geography','demographics','socioeconomic','real_estate','building_stock','land_use','infrastructure','mobility','environment','safety','history','intelligence','evidence')),
  semantic_role TEXT NOT NULL,
  sensitivity_class TEXT NOT NULL DEFAULT 'AGGREGATE_PUBLIC',
  lifecycle_status TEXT NOT NULL CHECK (lifecycle_status IN ('ACTIVE','DEPRECATED','RETIRED')),
  created_at_iso TEXT NOT NULL
);

CREATE TABLE nips_variable_versions (
  variable_id TEXT NOT NULL,
  definition_version TEXT NOT NULL,
  definition_json TEXT NOT NULL CHECK (json_valid(definition_json)),
  unit_code TEXT,
  currency_policy TEXT,
  allowed_geographic_levels_json TEXT NOT NULL CHECK (json_valid(allowed_geographic_levels_json)),
  allowed_temporal_kinds_json TEXT NOT NULL CHECK (json_valid(allowed_temporal_kinds_json)),
  created_at_iso TEXT NOT NULL,
  PRIMARY KEY(variable_id, definition_version),
  FOREIGN KEY(variable_id) REFERENCES nips_variables(variable_id)
);

CREATE TABLE nips_methodologies (
  methodology_id TEXT NOT NULL,
  version TEXT NOT NULL,
  method_type TEXT NOT NULL,
  definition_hash TEXT NOT NULL,
  definition_json TEXT NOT NULL CHECK (json_valid(definition_json)),
  artifact_reference TEXT,
  lifecycle_status TEXT NOT NULL CHECK (lifecycle_status IN ('DRAFT','APPROVED','RETIRED')),
  created_at_iso TEXT NOT NULL,
  PRIMARY KEY(methodology_id, version)
);

CREATE TABLE nips_source_variable_mappings (
  mapping_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  source_dataset_id TEXT NOT NULL,
  source_field_path TEXT NOT NULL,
  source_schema_version TEXT NOT NULL,
  variable_id TEXT NOT NULL,
  variable_definition_version TEXT NOT NULL,
  mapping_version TEXT NOT NULL,
  mapping_json TEXT NOT NULL CHECK (json_valid(mapping_json)),
  status TEXT NOT NULL CHECK (status IN ('DRAFT','APPROVED','REJECTED','RETIRED')),
  effective_from_iso TEXT,
  effective_to_iso TEXT,
  CHECK (effective_from_iso IS NULL OR effective_to_iso IS NULL OR effective_from_iso <= effective_to_iso),
  FOREIGN KEY(variable_id, variable_definition_version)
    REFERENCES nips_variable_versions(variable_id, definition_version),
  UNIQUE(source_id, source_dataset_id, source_field_path, source_schema_version, mapping_version)
);

CREATE TABLE nips_transformation_runs (
  run_id TEXT PRIMARY KEY,
  methodology_id TEXT NOT NULL,
  methodology_version TEXT NOT NULL,
  code_build_id TEXT NOT NULL,
  input_manifest_hash TEXT NOT NULL,
  input_watermarks_json TEXT NOT NULL CHECK (json_valid(input_watermarks_json)),
  parameter_hash TEXT NOT NULL,
  output_manifest_hash TEXT,
  status TEXT NOT NULL CHECK (status IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED')),
  deterministic INTEGER NOT NULL CHECK (deterministic IN (0,1)),
  started_at_iso TEXT NOT NULL,
  completed_at_iso TEXT,
  FOREIGN KEY(methodology_id, methodology_version)
    REFERENCES nips_methodologies(methodology_id, version)
);

CREATE TABLE nips_evidence_manifests (
  evidence_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  source_record_key TEXT,
  received_at_iso TEXT NOT NULL,
  observed_at_iso TEXT,
  raw_object_key TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64 AND sha256 NOT GLOB '*[^a-fA-F0-9]*'),
  media_type TEXT NOT NULL,
  source_version TEXT,
  permission_status TEXT NOT NULL CHECK (permission_status IN ('PUBLIC_REDISTRIBUTION','DERIVED_ONLY','RESTRICTED','PROHIBITED','UNVERIFIED')),
  retention_class TEXT NOT NULL,
  lifecycle TEXT NOT NULL CHECK (lifecycle IN ('RECEIVED','VALIDATED','REJECTED','SUPERSEDED','REMOVED')),
  validation_report_ref TEXT
);

CREATE TABLE nips_canonical_observations (
  observation_id TEXT PRIMARY KEY,
  deduplication_key TEXT NOT NULL UNIQUE,
  canonical_entity_id TEXT NOT NULL,
  variable_id TEXT NOT NULL,
  variable_definition_version TEXT NOT NULL,
  mapping_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  value_json TEXT,
  value_state TEXT NOT NULL CHECK (value_state IN ('OBSERVED','ESTIMATED','ALLOCATED','SUPPRESSED','MISSING','UNAVAILABLE','NOT_APPLICABLE','UNDER_REVIEW','STALE')),
  unit_code TEXT,
  currency_code TEXT,
  semantic_role TEXT NOT NULL,
  observed_at_iso TEXT NOT NULL,
  period_start_iso TEXT,
  period_end_iso TEXT,
  source_geographic_level TEXT NOT NULL,
  target_geographic_level TEXT NOT NULL,
  boundary_version_id TEXT,
  assignment_method TEXT NOT NULL CHECK (assignment_method IN ('DIRECT','SPATIAL_JOIN','APPROVED_ALLOCATION','NETWORK','UNKNOWN')),
  supersedes_observation_id TEXT,
  lifecycle TEXT NOT NULL CHECK (lifecycle IN ('ACTIVE','SUPERSEDED','REJECTED')),
  created_at_iso TEXT NOT NULL,
  FOREIGN KEY(variable_id, variable_definition_version)
    REFERENCES nips_variable_versions(variable_id, definition_version),
  FOREIGN KEY(mapping_id) REFERENCES nips_source_variable_mappings(mapping_id),
  FOREIGN KEY(run_id) REFERENCES nips_transformation_runs(run_id),
  FOREIGN KEY(supersedes_observation_id) REFERENCES nips_canonical_observations(observation_id),
  CHECK ((value_state IN ('MISSING','UNAVAILABLE','SUPPRESSED','NOT_APPLICABLE') AND value_json IS NULL)
      OR (value_state = 'OBSERVED' AND value_json IS NOT NULL)
      OR value_state IN ('ESTIMATED','ALLOCATED','UNDER_REVIEW','STALE')),
  CHECK (period_start_iso IS NULL OR period_end_iso IS NULL OR period_start_iso <= period_end_iso)
);
CREATE INDEX idx_nips_observations_entity_variable_time
  ON nips_canonical_observations(canonical_entity_id, variable_id, observed_at_iso DESC);
CREATE INDEX idx_nips_observations_variable_period
  ON nips_canonical_observations(variable_id, period_start_iso, period_end_iso);

CREATE TABLE nips_observation_evidence (
  observation_id TEXT NOT NULL,
  evidence_id TEXT NOT NULL,
  role TEXT NOT NULL,
  PRIMARY KEY(observation_id, evidence_id, role),
  FOREIGN KEY(observation_id) REFERENCES nips_canonical_observations(observation_id),
  FOREIGN KEY(evidence_id) REFERENCES nips_evidence_manifests(evidence_id)
);

CREATE TABLE nips_profile_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  canonical_entity_id TEXT NOT NULL,
  irni_registry_revision INTEGER NOT NULL,
  boundary_version_id TEXT,
  boundary_geometry_hash TEXT,
  boundary_scheme_version TEXT,
  schema_version TEXT NOT NULL,
  variable_catalog_version TEXT NOT NULL,
  source_registry_revision TEXT,
  methodology_catalog_version TEXT NOT NULL,
  publication_policy_version TEXT NOT NULL,
  assembly_build_id TEXT NOT NULL,
  source_watermark_hash TEXT NOT NULL,
  content_hash TEXT,
  publication_state TEXT NOT NULL CHECK (publication_state IN ('DRAFT','PROVISIONAL','PUBLISHED','REVOKED','STALE')),
  created_at_iso TEXT NOT NULL,
  assembled_at_iso TEXT NOT NULL,
  published_at_iso TEXT,
  UNIQUE(snapshot_id, canonical_entity_id)
);
CREATE INDEX idx_nips_snapshots_entity_time
  ON nips_profile_snapshots(canonical_entity_id, assembled_at_iso DESC);
CREATE INDEX idx_nips_snapshots_entity_state_time
  ON nips_profile_snapshots(canonical_entity_id, publication_state, assembled_at_iso DESC);

CREATE TABLE nips_profile_domain_states (
  snapshot_id TEXT NOT NULL,
  domain_id TEXT NOT NULL CHECK (domain_id IN ('identity','geography','demographics','socioeconomic','real_estate','building_stock','land_use','infrastructure','mobility','environment','safety','history','intelligence','evidence')),
  state TEXT NOT NULL CHECK (state IN ('READY','PARTIAL','STALE','BLOCKED','UNAVAILABLE','NOT_APPLICABLE')),
  updated_at_iso TEXT,
  publishable_metric_count INTEGER NOT NULL DEFAULT 0 CHECK (publishable_metric_count >= 0),
  blocked_metric_count INTEGER NOT NULL DEFAULT 0 CHECK (blocked_metric_count >= 0),
  stale_metric_count INTEGER NOT NULL DEFAULT 0 CHECK (stale_metric_count >= 0),
  unavailable_metric_count INTEGER NOT NULL DEFAULT 0 CHECK (unavailable_metric_count >= 0),
  readiness_json TEXT NOT NULL CHECK (json_valid(readiness_json)),
  domain_data_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(domain_data_json)),
  PRIMARY KEY(snapshot_id, domain_id),
  FOREIGN KEY(snapshot_id) REFERENCES nips_profile_snapshots(snapshot_id)
);

CREATE TABLE nips_profile_metrics (
  snapshot_id TEXT NOT NULL,
  metric_id TEXT NOT NULL,
  domain_id TEXT NOT NULL CHECK (domain_id IN ('identity','geography','demographics','socioeconomic','real_estate','building_stock','land_use','infrastructure','mobility','environment','safety','history','intelligence','evidence')),
  variable_id TEXT NOT NULL,
  variable_definition_version TEXT NOT NULL,
  semantic_role TEXT NOT NULL,
  value_json TEXT,
  value_state TEXT NOT NULL CHECK (value_state IN ('OBSERVED','ESTIMATED','ALLOCATED','SUPPRESSED','MISSING','UNAVAILABLE','NOT_APPLICABLE','UNDER_REVIEW','STALE')),
  unit_code TEXT,
  currency_code TEXT,
  temporal_contract_json TEXT NOT NULL CHECK (json_valid(temporal_contract_json)),
  geography_contract_json TEXT NOT NULL CHECK (json_valid(geography_contract_json)),
  methodology_id TEXT NOT NULL,
  methodology_version TEXT NOT NULL,
  quality_json TEXT NOT NULL CHECK (json_valid(quality_json)),
  comparability_key TEXT,
  display_contract_json TEXT NOT NULL CHECK (json_valid(display_contract_json)),
  PRIMARY KEY(snapshot_id, metric_id),
  FOREIGN KEY(snapshot_id, domain_id) REFERENCES nips_profile_domain_states(snapshot_id, domain_id),
  FOREIGN KEY(variable_id, variable_definition_version)
    REFERENCES nips_variable_versions(variable_id, definition_version),
  FOREIGN KEY(methodology_id, methodology_version)
    REFERENCES nips_methodologies(methodology_id, version),
  CHECK ((value_state IN ('MISSING','UNAVAILABLE','SUPPRESSED','NOT_APPLICABLE') AND value_json IS NULL)
      OR (value_state = 'OBSERVED' AND value_json IS NOT NULL)
      OR value_state IN ('ESTIMATED','ALLOCATED','UNDER_REVIEW','STALE'))
);
CREATE INDEX idx_nips_metrics_snapshot_domain
  ON nips_profile_metrics(snapshot_id, domain_id);
CREATE INDEX idx_nips_metrics_variable_state
  ON nips_profile_metrics(variable_id, value_state);

CREATE TABLE nips_metric_evidence (
  snapshot_id TEXT NOT NULL,
  metric_id TEXT NOT NULL,
  evidence_id TEXT NOT NULL,
  PRIMARY KEY(snapshot_id, metric_id, evidence_id),
  FOREIGN KEY(snapshot_id, metric_id) REFERENCES nips_profile_metrics(snapshot_id, metric_id),
  FOREIGN KEY(evidence_id) REFERENCES nips_evidence_manifests(evidence_id)
);

CREATE TABLE nips_metric_observations (
  snapshot_id TEXT NOT NULL,
  metric_id TEXT NOT NULL,
  observation_id TEXT NOT NULL,
  PRIMARY KEY(snapshot_id, metric_id, observation_id),
  FOREIGN KEY(snapshot_id, metric_id) REFERENCES nips_profile_metrics(snapshot_id, metric_id),
  FOREIGN KEY(observation_id) REFERENCES nips_canonical_observations(observation_id)
);

CREATE TABLE nips_snapshot_sources (
  snapshot_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_watermark TEXT NOT NULL,
  permission_status TEXT NOT NULL CHECK (permission_status IN ('PUBLIC_REDISTRIBUTION','DERIVED_ONLY','RESTRICTED','PROHIBITED','UNVERIFIED')),
  PRIMARY KEY(snapshot_id, source_id),
  FOREIGN KEY(snapshot_id) REFERENCES nips_profile_snapshots(snapshot_id)
);

CREATE TABLE nips_profile_publications (
  publication_id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL,
  canonical_entity_id TEXT NOT NULL,
  product_key TEXT NOT NULL,
  audience TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('APPROVED','REJECTED','REVOKED')),
  status TEXT NOT NULL CHECK (status IN ('ACTIVE','SUPERSEDED','REVOKED')),
  decided_at_iso TEXT NOT NULL,
  actor_reference TEXT,
  revocation_reason TEXT,
  FOREIGN KEY(snapshot_id, canonical_entity_id)
    REFERENCES nips_profile_snapshots(snapshot_id, canonical_entity_id),
  UNIQUE(publication_id, canonical_entity_id, product_key, audience)
);

CREATE UNIQUE INDEX uq_nips_active_publication_decision
  ON nips_profile_publications(canonical_entity_id, product_key, audience)
  WHERE status = 'ACTIVE';

CREATE TABLE nips_active_publications (
  canonical_entity_id TEXT NOT NULL,
  product_key TEXT NOT NULL,
  audience TEXT NOT NULL,
  publication_id TEXT NOT NULL,
  activated_at_iso TEXT NOT NULL,
  PRIMARY KEY(canonical_entity_id, product_key, audience),
  FOREIGN KEY(publication_id, canonical_entity_id, product_key, audience)
    REFERENCES nips_profile_publications(publication_id, canonical_entity_id, product_key, audience)
);

CREATE INDEX idx_nips_evidence_source_time
  ON nips_evidence_manifests(source_id, observed_at_iso DESC);
CREATE INDEX idx_nips_evidence_hash
  ON nips_evidence_manifests(sha256);
CREATE INDEX idx_nips_runs_status_time
  ON nips_transformation_runs(status, completed_at_iso DESC);
CREATE INDEX idx_nips_publications_snapshot
  ON nips_profile_publications(snapshot_id, status, decided_at_iso DESC);
