/**
 * @file worker/db/migrations/0001_initial_schema.sql
 * @description Cloudflare D1 Relational Baseline Schema for Tehran Radar.
 *
 * Covers candidate domains:
 * - `neighborhood_benchmarks`: Price overrides, rent rates, and active sponsor cards.
 * - `bargain_listings`: Moderated below-market property listings.
 * - `sponsor_subscriptions`: Realtor subscription ledger and tracking codes.
 * - `media_objects`: Object storage metadata, sha256 checksums, and lifecycle states.
 * - `d1_migrations`: Migration tracking table.
 */

-- Migration metadata table
CREATE TABLE IF NOT EXISTS _cf_migrations (
  migration_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  checksum_sha256 TEXT NOT NULL,
  applied_at_iso TEXT NOT NULL,
  execution_duration_ms INTEGER NOT NULL,
  statement_count INTEGER NOT NULL
);

-- Neighborhood Benchmarks (hoodId 1..999)
CREATE TABLE IF NOT EXISTS neighborhood_benchmarks (
  hood_id INTEGER PRIMARY KEY CHECK (hood_id >= 1 AND hood_id <= 999),
  city_id TEXT NOT NULL DEFAULT 'tehran',
  buy_per_sqm_million REAL NOT NULL CHECK (buy_per_sqm_million >= 10.0 AND buy_per_sqm_million <= 5000.0),
  rahn_80m_million REAL NOT NULL CHECK (rahn_80m_million >= 50.0 AND rahn_80m_million <= 100000.0),
  sponsor_name TEXT,
  sponsor_phone TEXT,
  sponsor_specialty TEXT,
  sponsor_experience_years INTEGER,
  sponsor_expires_at_iso TEXT,
  pros_text TEXT,
  cons_text TEXT,
  updated_at_iso TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_benchmarks_city ON neighborhood_benchmarks (city_id);

-- Bargain Property Listings
CREATE TABLE IF NOT EXISTS bargain_listings (
  id TEXT PRIMARY KEY,
  owner_uid TEXT NOT NULL,
  city_id TEXT NOT NULL DEFAULT 'tehran',
  hood_id INTEGER NOT NULL REFERENCES neighborhood_benchmarks(hood_id),
  title TEXT NOT NULL,
  deal_type TEXT NOT NULL CHECK (deal_type IN ('خرید', 'اجاره')),
  sqm REAL NOT NULL CHECK (sqm >= 25.0 AND sqm <= 1000.0),
  price_text TEXT NOT NULL,
  discount_percent REAL NOT NULL CHECK (discount_percent >= 10.0 AND discount_percent <= 60.0),
  buyer_profit_text TEXT NOT NULL,
  street TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  image_url TEXT,
  video_url TEXT,
  created_at_iso TEXT NOT NULL,
  updated_at_iso TEXT
);

CREATE INDEX IF NOT EXISTS idx_bargains_hood_status ON bargain_listings (hood_id, status);
CREATE INDEX IF NOT EXISTS idx_bargains_owner ON bargain_listings (owner_uid);
CREATE INDEX IF NOT EXISTS idx_bargains_discount ON bargain_listings (discount_percent DESC);

-- Sponsor Subscriptions Ledger
CREATE TABLE IF NOT EXISTS sponsor_subscriptions (
  id TEXT PRIMARY KEY,
  created_by_uid TEXT NOT NULL,
  hood_id INTEGER NOT NULL REFERENCES neighborhood_benchmarks(hood_id),
  agency_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  specialty TEXT NOT NULL,
  experience_years INTEGER NOT NULL,
  monthly_tariff_million REAL NOT NULL,
  plan_months INTEGER NOT NULL CHECK (plan_months IN (1, 3)),
  total_payable_million REAL NOT NULL,
  tracking_code TEXT NOT NULL UNIQUE,
  expires_at_iso TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  created_at_iso TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sponsors_hood ON sponsor_subscriptions (hood_id);
CREATE INDEX IF NOT EXISTS idx_sponsors_creator ON sponsor_subscriptions (created_by_uid);

-- Object Storage Media Metadata
CREATE TABLE IF NOT EXISTS media_objects (
  object_id TEXT PRIMARY KEY,
  owner_uid TEXT NOT NULL,
  city_id TEXT NOT NULL,
  hood_id INTEGER NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  sha256_checksum TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  provider_id TEXT NOT NULL DEFAULT 'cloudflare_r2',
  lifecycle_state TEXT NOT NULL CHECK (lifecycle_state IN ('CREATED', 'AUTHORIZED', 'UPLOADING', 'UPLOADED', 'VERIFYING', 'VERIFIED', 'PUBLISHED', 'FAILED', 'ABORTED', 'EXPIRED')),
  deletion_state TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (deletion_state IN ('ACTIVE', 'SOFT_DELETED', 'PENDING_PHYSICAL_DELETE', 'PHYSICALLY_DELETED', 'RETENTION_LOCKED', 'LEGAL_HOLD_PROTECTED')),
  target_type TEXT NOT NULL DEFAULT 'UNATTACHED' CHECK (target_type IN ('UNATTACHED', 'BARGAIN', 'SPONSOR')),
  target_id TEXT,
  legal_hold INTEGER NOT NULL DEFAULT 0 CHECK (legal_hold IN (0, 1)),
  retention_until_iso TEXT,
  created_at_iso TEXT NOT NULL,
  updated_at_iso TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_media_target ON media_objects (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_media_owner ON media_objects (owner_uid);
CREATE INDEX IF NOT EXISTS idx_media_deletion_state ON media_objects (deletion_state);
