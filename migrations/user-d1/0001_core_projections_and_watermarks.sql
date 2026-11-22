-- Canonical Staging & Edge D1 Migration 0001: Core Projections, Bargains, and Sync Watermarks
-- Authoritative Migration Ledger: d1_migrations (managed by Wrangler D1 Migrations)
-- Data Authority: Cloud Firestore (ai-studio-e48df7a4-9535-4bf0-a948-61a6a0f37a6a) remains primary source of truth.
CREATE TABLE IF NOT EXISTS neighborhood_projections (
  city_id TEXT NOT NULL,
  hood_id INTEGER NOT NULL,
  name_fa TEXT NOT NULL,
  district INTEGER NOT NULL,
  buy_per_sqm_million REAL NOT NULL,
  deal_per_sqm_million REAL NOT NULL,
  rahn_80m_million REAL NOT NULL,
  aqi INTEGER NOT NULL,
  investment_score REAL NOT NULL,
  firestore_version_iso TEXT NOT NULL,
  projected_at_iso TEXT NOT NULL,
  PRIMARY KEY (city_id, hood_id)
);

CREATE INDEX IF NOT EXISTS idx_hood_proj_city_price ON neighborhood_projections(city_id, buy_per_sqm_million);

CREATE TABLE IF NOT EXISTS bargain_projections (
  bargain_id TEXT PRIMARY KEY,
  city_id TEXT NOT NULL,
  hood_id INTEGER NOT NULL,
  hood_name TEXT NOT NULL,
  title TEXT NOT NULL,
  sqm INTEGER NOT NULL,
  price_millions REAL NOT NULL,
  discount_percent REAL NOT NULL,
  lifecycle_state TEXT NOT NULL,
  updated_at_iso TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bargain_proj_city_hood ON bargain_projections(city_id, hood_id, lifecycle_state);

CREATE TABLE IF NOT EXISTS sync_watermarks (
  watermark_key TEXT PRIMARY KEY,
  watermark_value TEXT NOT NULL,
  updated_at_iso TEXT NOT NULL
);
