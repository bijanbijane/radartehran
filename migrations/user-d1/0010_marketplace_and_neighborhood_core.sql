-- USER_DB Migration 0010:
-- Canonical Cloudflare D1 ownership for core marketplace and neighborhood state.
-- These tables replace the former Firestore collections for new writes.
-- Binary media storage is intentionally excluded while R2 remains disabled/deferred.

CREATE TABLE IF NOT EXISTS bargains (
  bargain_id TEXT PRIMARY KEY,
  owner_uid TEXT NOT NULL REFERENCES user_profiles(uid) ON DELETE CASCADE,
  city_id TEXT NOT NULL DEFAULT 'tehran',
  hood_id INTEGER NOT NULL CHECK (hood_id BETWEEN 1 AND 9999),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  listing_type TEXT NOT NULL CHECK (listing_type IN ('خرید', 'اجاره')),
  sqm INTEGER NOT NULL CHECK (sqm BETWEEN 25 AND 1000),
  price_millions REAL NOT NULL CHECK (price_millions > 0),
  price_text TEXT NOT NULL CHECK (length(price_text) <= 160),
  discount_percent REAL NOT NULL CHECK (discount_percent BETWEEN 10 AND 60),
  buyer_profit_text TEXT NOT NULL DEFAULT '',
  street TEXT NOT NULL DEFAULT '',
  media_metadata_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(media_metadata_json)),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  created_at_iso TEXT NOT NULL,
  updated_at_iso TEXT NOT NULL,
  approved_at_iso TEXT
);

CREATE INDEX IF NOT EXISTS idx_bargains_public_city_hood_status
  ON bargains(city_id, hood_id, status, created_at_iso DESC);
CREATE INDEX IF NOT EXISTS idx_bargains_owner_status
  ON bargains(owner_uid, status, created_at_iso DESC);

ALTER TABLE bargain_projections ADD COLUMN owner_uid TEXT;
CREATE INDEX IF NOT EXISTS idx_bargain_projections_owner ON bargain_projections(owner_uid);

CREATE TABLE IF NOT EXISTS sponsor_requests (
  request_id TEXT PRIMARY KEY,
  owner_uid TEXT NOT NULL REFERENCES user_profiles(uid) ON DELETE CASCADE,
  city_id TEXT NOT NULL DEFAULT 'tehran',
  hood_id INTEGER NOT NULL CHECK (hood_id BETWEEN 1 AND 9999),
  hood_name TEXT NOT NULL CHECK (length(hood_name) <= 120),
  agency_name TEXT NOT NULL CHECK (length(agency_name) BETWEEN 1 AND 120),
  phone_e164 TEXT NOT NULL CHECK (length(phone_e164) BETWEEN 8 AND 20),
  specialty TEXT NOT NULL DEFAULT '' CHECK (length(specialty) <= 120),
  experience_years INTEGER NOT NULL DEFAULT 0 CHECK (experience_years BETWEEN 0 AND 80),
  monthly_tariff_million REAL NOT NULL DEFAULT 0 CHECK (monthly_tariff_million >= 0),
  plan_months INTEGER NOT NULL DEFAULT 1 CHECK (plan_months IN (1, 3)),
  total_payable_million REAL NOT NULL DEFAULT 0 CHECK (total_payable_million >= 0),
  tracking_code TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  expires_at_iso TEXT,
  created_at_iso TEXT NOT NULL,
  updated_at_iso TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sponsor_requests_city_hood_status
  ON sponsor_requests(city_id, hood_id, status, created_at_iso DESC);
CREATE INDEX IF NOT EXISTS idx_sponsor_requests_owner_created
  ON sponsor_requests(owner_uid, created_at_iso DESC);

CREATE TABLE IF NOT EXISTS buyer_alerts (
  alert_id TEXT PRIMARY KEY,
  owner_uid TEXT NOT NULL REFERENCES user_profiles(uid) ON DELETE CASCADE,
  city_id TEXT NOT NULL DEFAULT 'tehran',
  hood_id INTEGER NOT NULL CHECK (hood_id BETWEEN 1 AND 9999),
  full_name TEXT NOT NULL CHECK (length(full_name) BETWEEN 1 AND 100),
  phone_e164 TEXT NOT NULL CHECK (length(phone_e164) BETWEEN 8 AND 20),
  deal_type TEXT NOT NULL CHECK (deal_type IN ('خرید', 'اجاره')),
  max_budget_million REAL NOT NULL CHECK (max_budget_million > 0),
  consent_version TEXT NOT NULL,
  consent_at_iso TEXT NOT NULL,
  expires_at_iso TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'closed')),
  created_at_iso TEXT NOT NULL,
  updated_at_iso TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_buyer_alerts_city_hood_status
  ON buyer_alerts(city_id, hood_id, status, created_at_iso DESC);
CREATE INDEX IF NOT EXISTS idx_buyer_alerts_owner_created
  ON buyer_alerts(owner_uid, created_at_iso DESC);

CREATE TABLE IF NOT EXISTS neighborhood_votes (
  vote_id TEXT PRIMARY KEY,
  owner_uid TEXT NOT NULL REFERENCES user_profiles(uid) ON DELETE CASCADE,
  city_id TEXT NOT NULL DEFAULT 'tehran',
  hood_id INTEGER NOT NULL CHECK (hood_id BETWEEN 1 AND 9999),
  air_score REAL NOT NULL CHECK (air_score BETWEEN 0 AND 10),
  power_score REAL NOT NULL CHECK (power_score BETWEEN 0 AND 10),
  internet_score REAL NOT NULL CHECK (internet_score BETWEEN 0 AND 10),
  metro_score REAL NOT NULL CHECK (metro_score BETWEEN 0 AND 10),
  security_score REAL NOT NULL CHECK (security_score BETWEEN 0 AND 10),
  flat_score REAL NOT NULL CHECK (flat_score BETWEEN 0 AND 10),
  comment TEXT NOT NULL DEFAULT '' CHECK (length(comment) <= 1000),
  user_display_name TEXT NOT NULL DEFAULT '' CHECK (length(user_display_name) <= 100),
  created_at_iso TEXT NOT NULL,
  updated_at_iso TEXT NOT NULL,
  UNIQUE(owner_uid, city_id, hood_id)
);

CREATE INDEX IF NOT EXISTS idx_neighborhood_votes_city_hood
  ON neighborhood_votes(city_id, hood_id, updated_at_iso DESC);

CREATE TABLE IF NOT EXISTS neighborhood_overrides (
  city_id TEXT NOT NULL DEFAULT 'tehran',
  hood_id INTEGER NOT NULL CHECK (hood_id BETWEEN 1 AND 9999),
  buy_per_sqm REAL,
  rahn_80m REAL,
  sponsor_json TEXT CHECK (sponsor_json IS NULL OR json_valid(sponsor_json)),
  override_source TEXT NOT NULL DEFAULT 'ADMIN_MANUAL',
  manual_lock_until_ms INTEGER,
  updated_by_uid TEXT NOT NULL,
  updated_at_iso TEXT NOT NULL,
  PRIMARY KEY(city_id, hood_id)
);

CREATE TABLE IF NOT EXISTS app_config (
  config_key TEXT PRIMARY KEY,
  config_json TEXT NOT NULL CHECK (json_valid(config_json)),
  updated_by_uid TEXT,
  updated_at_iso TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_preferences (
  uid TEXT PRIMARY KEY REFERENCES user_profiles(uid) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'rent' CHECK (mode IN ('rent', 'buy')),
  deposit REAL NOT NULL DEFAULT 0 CHECK (deposit BETWEEN 0 AND 100000),
  monthly_rent REAL NOT NULL DEFAULT 0 CHECK (monthly_rent BETWEEN 0 AND 1000),
  buy_total_budget REAL NOT NULL DEFAULT 6500 CHECK (buy_total_budget BETWEEN 500 AND 1000000),
  target_sqm REAL NOT NULL DEFAULT 80 CHECK (target_sqm BETWEEN 20 AND 1000),
  work_hub_id TEXT NOT NULL DEFAULT 'none' CHECK (length(work_hub_id) <= 40),
  updated_at_iso TEXT NOT NULL
);
